import Realm from 'realm';
import {
  AccountsApiError,
  type AuthorizedAccountsApiClient,
} from '@/relisten/accounts/api/accounts_api_client';
import type { AccountScopeSnapshot } from '@/relisten/accounts/account_context';
import {
  Playlist,
  PlaylistCommand,
  PlaylistOperation,
} from '@/relisten/realm/models/playlists/playlist';
import {
  applyChangesPage,
  applySnapshot,
  issueCreateCommand,
  OVERLAY_STATES,
  rebuildDisplayed,
  startRestoreRecovery,
} from '@/relisten/playlists/sync/playlist_sync_state';
import {
  ACCEPTED_STATUSES,
  addedTrackIds,
  type ArchiveStateResponse,
  type CreatePlaylistResponse,
  type OperationBatchResponse,
  type PlaylistChangesResponse,
  type PlaylistEdit,
  type PlaylistSnapshotResponse,
  toWireOperation,
  type WireOperation,
} from '@/relisten/playlists/sync/playlist_wire';
import { createUuidV7TypedId } from '@/relisten/util/typed_uuid_id';
import { log } from '@/relisten/util/logging';

const logger = log.extend('playlist-sync');

/**
 * Edits are sent after this long without another edit, so dragging a track
 * around sends one batch instead of many. The outbox is durable, so the delay
 * risks nothing; other devices just see changes a little later. Leaving a
 * playlist, finishing an edit or backgrounding the app sends at once.
 */
export const SEND_DELAY_MS = 20_000;
const RETRY_DELAY_MS = 30_000;
const MAX_BATCH_OPERATIONS = 500;
const MAX_BATCH_BYTES = 1.5 * 1024 * 1024;

export interface PlaylistSyncEnvironment {
  account: AccountScopeSnapshot;
  appIsActive: boolean;
  canMakeNetworkRequests: boolean;
}

/**
 * Sends account playlists' create commands and edits, and pulls their changes.
 *
 * One run, for the signed-in account only: send create commands, send each
 * playlist's pending edits in order, then pull every playlist whose summary is
 * ahead of what this device applied. Edits stay in the outbox until a pull
 * confirms them, so a response lost to a crash or a switched account is simply
 * resent with the same IDs and replayed by the server.
 */
export class PlaylistSyncService {
  private environment: PlaylistSyncEnvironment | undefined;
  private started = false;
  private running = false;
  private rerunRequested = false;
  private flushRequested = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retryAt = 0;
  /** Lowered after a 413 so an oversized batch is split; restored after a success. */
  private batchLimit = MAX_BATCH_OPERATIONS;
  private readonly operations;
  private readonly commands;
  private readonly playlists;

  constructor(
    private readonly realm: Realm,
    private readonly api: AuthorizedAccountsApiClient
  ) {
    this.operations = realm.objects(PlaylistOperation);
    this.commands = realm.objects(PlaylistCommand);
    this.playlists = realm.objects(Playlist).filtered('ownerUserId != null');
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.operations.addListener(this.requestRun);
    this.commands.addListener(this.requestRun);
    this.playlists.addListener(this.requestRun, [
      'summaryRevision',
      'appliedRevision',
      'serverState',
    ]);
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    if (!this.realm.isClosed) {
      this.operations.removeListener(this.requestRun);
      this.commands.removeListener(this.requestRun);
      this.playlists.removeListener(this.requestRun);
    }
    clearTimeout(this.timer);
  }

  updateEnvironment(environment: PlaylistSyncEnvironment) {
    const becameRunnable = !this.canRun() && canRun(environment);
    this.environment = environment;
    if (becameRunnable) {
      this.retryAt = 0;
      this.flushRequested = true;
    }
    this.requestRun();
  }

  /** Sends pending edits now instead of waiting for the quiet period. */
  flush = () => {
    this.flushRequested = true;
    this.retryAt = 0;
    this.requestRun();
  };

  /**
   * Archives or restores an account playlist. Archive is online-only and never
   * queued, so this throws when it cannot reach the account.
   */
  async setArchived(playlistId: string, archived: boolean) {
    const response = await this.api.request<ArchiveStateResponse>(
      `/v1/playlists/${playlistId}/archive-state`,
      jsonRequest('PUT', {
        contract_version: 1,
        command_id: createUuidV7TypedId('command'),
        archived,
      })
    );
    this.realm.write(() => {
      const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
      if (!playlist) return;
      playlist.archived = response.archived;
      if (!response.archived) {
        // Edits held while it was archived can go now.
        for (const op of this.held(playlistId)) op.state = 'pending';
      }
    });
    this.flush();
  }

  /** Drops edits held because the playlist was deleted on another device. */
  discardHeldEdits(playlistId: string) {
    this.realm.write(() => {
      this.realm.delete(this.held(playlistId));
      rebuildDisplayed(this.realm, playlistId);
    });
  }

  /** Clears a refused addition's notice. */
  dismissRefused(playlistId: string) {
    this.realm.write(() => {
      this.realm.delete(
        this.operations.filtered('playlistId == $0 AND state == $1', playlistId, 'needs_attention')
      );
    });
  }

  private held(playlistId: string) {
    return this.operations.filtered(
      'playlistId == $0 AND state == $1',
      playlistId,
      'archived_hold'
    );
  }

  private readonly requestRun = () => {
    if (!this.started || !this.canRun()) return;
    if (this.running) {
      this.rerunRequested = true;
      return;
    }
    // Realm listeners can fire while the write that woke them is unwinding.
    queueMicrotask(() => void this.run());
  };

  private async run() {
    if (this.running || !this.canRun()) return;
    this.running = true;
    clearTimeout(this.timer);
    this.timer = undefined;

    try {
      do {
        this.rerunRequested = false;
        const userId = this.environment!.account.userId!;
        if (Date.now() < this.retryAt) {
          this.schedule(this.retryAt - Date.now());
          return;
        }

        const flush = this.flushRequested;
        this.flushRequested = false;
        const waitMs = this.quietPeriodRemaining(userId);
        if (flush || waitMs <= 0) {
          await this.sendCreateCommands(userId);
          await this.sendEdits(userId);
        } else {
          this.schedule(waitMs);
        }
        await this.pull(userId);
      } while (this.rerunRequested && this.canRun());
    } catch (error) {
      logger.warn(`playlist sync paused: ${describe(error)}`);
      this.retryAt = Date.now() + RETRY_DELAY_MS;
      this.schedule(RETRY_DELAY_MS);
    } finally {
      this.running = false;
      if (this.rerunRequested) this.requestRun();
    }
  }

  /** Milliseconds until the newest unsent edit or command has been quiet long enough. */
  private quietPeriodRemaining(userId: string): number {
    const newest = [
      ...this.operations
        .filtered('ownerUserId == $0 AND state == $1', userId, 'pending')
        .sorted('createdAt', true)
        .slice(0, 1),
      ...this.commands
        .filtered('ownerUserId == $0 AND state == $1', userId, 'pending')
        .sorted('createdAt', true)
        .slice(0, 1),
    ].map((row) => row.createdAt.getTime());
    if (newest.length === 0) return 0;
    return Math.max(...newest) + SEND_DELAY_MS - Date.now();
  }

  // region Create commands

  private async sendCreateCommands(userId: string) {
    const pending = [
      ...this.commands
        .filtered('ownerUserId == $0 AND state == $1', userId, 'pending')
        .sorted('createdAt'),
    ];
    for (const command of pending) {
      const { commandId, playlistId, requestJson } = command;
      this.realm.write(() => {
        command.attemptCount += 1;
      });

      try {
        await this.api.request<CreatePlaylistResponse>('/v1/playlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestJson,
        });
        this.finishCreate(commandId, playlistId, 'synced');
      } catch (error) {
        const code = problemCode(error);
        if (code === 'quota_exceeded') {
          this.finishCreate(commandId, playlistId, 'needs_attention', code);
        } else if (code === 'id_conflict') {
          // The account already has these IDs: an earlier attempt landed.
          this.finishCreate(commandId, playlistId, 'synced');
        } else if (isClientError(error)) {
          this.finishCreate(commandId, playlistId, 'needs_attention', code ?? 'rejected');
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * A confirmed create leaves the playlist without a canonical revision, so the
   * pull fetches its snapshot: the server's ranks replace the provisional ones
   * and edits made meanwhile replay on top.
   */
  private finishCreate(
    commandId: string,
    playlistId: string,
    state: 'synced' | 'needs_attention',
    errorCode?: string
  ) {
    this.realm.write(() => {
      const command = this.realm.objectForPrimaryKey(PlaylistCommand, commandId);
      const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
      if (playlist) {
        playlist.serverState = state;
        playlist.appliedRevision = undefined;
      }
      if (!command) return;
      if (state === 'synced') {
        this.realm.delete(command);
      } else {
        command.state = 'needs_attention';
        command.lastErrorCode = errorCode;
      }
    });
  }

  // endregion

  // region Edits

  private async sendEdits(userId: string) {
    const playlistIds = new Set(
      this.operations
        .filtered('ownerUserId == $0 AND state == $1', userId, 'pending')
        .map((op) => op.playlistId)
    );
    for (const playlistId of playlistIds) {
      const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
      // Edits wait behind the create command; an archived playlist answers 409 anyway.
      if (!playlist || playlist.serverState !== 'synced') continue;
      while (await this.sendBatch(playlistId)) {
        // Drain this playlist's outbox in bounded batches.
      }
    }
  }

  /** Sends the oldest pending edits for one playlist. Returns whether more are waiting. */
  private async sendBatch(playlistId: string): Promise<boolean> {
    const batch = this.prepareBatch(playlistId);
    if (batch.length === 0) return false;
    const ids = batch.map((op) => op.operation_id);

    let response: OperationBatchResponse;
    try {
      response = await this.api.request<OperationBatchResponse>(
        `/v1/playlists/${playlistId}/operations:batch`,
        jsonRequest('POST', { contract_version: 1, operations: batch })
      );
    } catch (error) {
      this.handleBatchFailure(playlistId, ids, error);
      return false;
    }

    this.batchLimit = MAX_BATCH_OPERATIONS;
    this.applyBatchResults(playlistId, response);
    return (
      this.operations.filtered('playlistId == $0 AND state == $1', playlistId, 'pending').length > 0
    );
  }

  private prepareBatch(playlistId: string): WireOperation[] {
    return this.realm.write(() => {
      const pending = this.operations
        .filtered('playlistId == $0 AND state == $1', playlistId, 'pending')
        .sorted('localSequence');
      const batch: WireOperation[] = [];
      let bytes = 0;
      for (const op of pending) {
        const wire = toWireOperation(
          op.operationId,
          op.baseRevision,
          JSON.parse(op.operationJson) as PlaylistEdit
        );
        bytes += JSON.stringify(wire).length;
        if (batch.length >= this.batchLimit || (batch.length > 0 && bytes > MAX_BATCH_BYTES)) {
          break;
        }
        op.state = 'in_flight';
        op.attemptCount += 1;
        batch.push(wire);
      }
      return batch;
    });
  }

  private applyBatchResults(playlistId: string, response: OperationBatchResponse) {
    this.realm.write(() => {
      const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
      if (!playlist) return;
      if (
        playlist.historyGeneration &&
        playlist.historyGeneration !== response.history_generation
      ) {
        startRestoreRecovery(this.realm, playlist.ownerUserId!);
        return;
      }

      for (const result of response.results) {
        const op = this.realm.objectForPrimaryKey(PlaylistOperation, result.operation_id);
        if (!op) continue;
        if (result.status === 'applied' && result.revision !== null) {
          op.state = 'acknowledged';
          op.resultRevision = result.revision;
          op.resultGeneration = response.history_generation;
        } else if (ACCEPTED_STATUSES.has(result.status)) {
          // Accepted without a revision: nothing will arrive to confirm it.
          this.realm.delete(op);
        } else {
          // The edit's intent did not land. Additions are offered again.
          op.state = 'needs_attention';
          op.lastErrorCode = result.status;
          op.failedTrackIds.push(...addedTrackIds(JSON.parse(op.operationJson) as PlaylistEdit));
        }
      }
      playlist.summaryRevision = Math.max(playlist.summaryRevision ?? 0, response.head_revision);
      rebuildDisplayed(this.realm, playlistId);
    });
  }

  private handleBatchFailure(playlistId: string, ids: string[], error: unknown) {
    const code = problemCode(error);
    const status = error instanceof AccountsApiError ? error.status : null;
    this.realm.write(() => {
      const inFlight = ids
        .map((id) => this.realm.objectForPrimaryKey(PlaylistOperation, id))
        .filter((op): op is PlaylistOperation => op !== null && op.state === 'in_flight');
      const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);

      if (code === 'playlist_archived') {
        for (const op of this.operations.filtered('playlistId == $0 AND state IN $1', playlistId, [
          'pending',
          'in_flight',
        ])) {
          op.state = 'archived_hold';
        }
        if (playlist) playlist.archived = true;
      } else if (code === 'quota_exceeded') {
        // The whole outbox waits; the next edit or a deletion elsewhere resends it.
        for (const op of this.operations.filtered('playlistId == $0 AND state IN $1', playlistId, [
          'pending',
          'in_flight',
        ])) {
          op.state = 'quota_paused';
        }
      } else if (code === 'playlist_not_found' && playlist) {
        // The account lost it (a restore older than the playlist). Recreate it
        // from what this device shows; held edits are already part of that.
        this.realm.delete(
          this.operations.filtered('playlistId == $0 AND state IN $1', playlistId, OVERLAY_STATES)
        );
        issueCreateCommand(this.realm, playlist);
      } else {
        for (const op of inFlight) op.state = 'pending';
        if (status === 413) this.batchLimit = Math.max(1, Math.floor(ids.length / 2));
      }
    });

    if (
      code !== 'playlist_archived' &&
      code !== 'quota_exceeded' &&
      code !== 'playlist_not_found'
    ) {
      if (status !== 413) throw error;
    }
  }

  // endregion

  // region Pull

  /**
   * Pulls every playlist this device should refresh: those without a canonical
   * state (new, created, or after a restore), and those whose summary or own
   * acknowledged edits are ahead of what was applied.
   */
  private async pull(userId: string) {
    const candidates = [
      ...this.realm
        .objects(Playlist)
        .filtered(
          'ownerUserId == $0 AND serverState == $1 AND archived == false',
          userId,
          'synced'
        ),
    ];
    for (const playlist of candidates) {
      if (!playlist.isValid()) continue;
      const playlistId = playlist.playlistId;
      if (playlist.appliedRevision == null) {
        await this.fetchSnapshot(playlistId);
      } else if (this.needsChanges(playlist)) {
        await this.fetchChanges(playlistId);
      }
    }
  }

  private needsChanges(playlist: Playlist) {
    const applied = playlist.appliedRevision ?? 0;
    if ((playlist.summaryRevision ?? 0) > applied) return true;
    return (
      this.operations.filtered(
        'playlistId == $0 AND state == $1 AND resultRevision > $2',
        playlist.playlistId,
        'acknowledged',
        applied
      ).length > 0
    );
  }

  private async fetchSnapshot(playlistId: string) {
    let snapshot: PlaylistSnapshotResponse;
    try {
      snapshot = await this.api.request<PlaylistSnapshotResponse>(
        `/v1/playlists/${playlistId}/snapshot`
      );
    } catch (error) {
      if (problemCode(error) === 'playlist_not_found') {
        this.recreate(playlistId);
        return;
      }
      throw error;
    }
    this.realm.write(() => {
      const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
      if (playlist) applySnapshot(this.realm, playlist, snapshot);
    });
  }

  private async fetchChanges(playlistId: string) {
    for (;;) {
      const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
      if (!playlist || playlist.appliedRevision == null) return;
      let page: PlaylistChangesResponse;
      try {
        page = await this.api.request<PlaylistChangesResponse>(
          `/v1/playlists/${playlistId}/changes?after_revision=${playlist.appliedRevision}`
        );
      } catch (error) {
        if (problemCode(error) === 'snapshot_required') {
          await this.fetchSnapshot(playlistId);
          return;
        }
        throw error;
      }

      const more = this.realm.write(() => {
        const current = this.realm.objectForPrimaryKey(Playlist, playlistId);
        if (!current) return false;
        if (current.historyGeneration !== page.history_generation) {
          startRestoreRecovery(this.realm, current.ownerUserId!);
          return false;
        }
        applyChangesPage(this.realm, current, page);
        return page.has_more;
      });
      if (!more) return;
    }
  }

  private recreate(playlistId: string) {
    this.realm.write(() => {
      const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
      if (!playlist) return;
      this.realm.delete(
        this.operations.filtered('playlistId == $0 AND state IN $1', playlistId, OVERLAY_STATES)
      );
      issueCreateCommand(this.realm, playlist);
    });
  }

  // endregion

  private schedule(delayMs: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        this.requestRun();
      },
      Math.max(0, delayMs)
    );
  }

  private canRun() {
    return this.environment !== undefined && canRun(this.environment);
  }
}

function canRun(environment: PlaylistSyncEnvironment) {
  return (
    environment.account.isAuthenticated &&
    !!environment.account.userId &&
    environment.appIsActive &&
    environment.canMakeNetworkRequests
  );
}

function jsonRequest(method: 'POST' | 'PUT', body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function problemCode(error: unknown): string | null {
  return error instanceof AccountsApiError ? error.code : null;
}

/** A 4xx the server will answer the same way every time; retrying cannot help. */
function isClientError(error: unknown) {
  return (
    error instanceof AccountsApiError &&
    error.status !== null &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 401 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

function describe(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
}
