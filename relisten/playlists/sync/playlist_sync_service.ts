import Realm from 'realm';
import {
  AccountsApiError,
  type AuthorizedAccountsApiClient,
} from '@/relisten/accounts/api/accounts_api_client';
import {
  type AccountScopeCapture,
  type AccountScopeSnapshot,
  type AccountScopeSource,
  StaleAccountScopeError,
} from '@/relisten/accounts/account_context';
import {
  Playlist,
  PlaylistCommand,
  PlaylistOperation,
} from '@/relisten/realm/models/playlists/playlist';
import {
  applyChangesPage,
  applySnapshot,
  issueCreateCommand,
  markNeedsSnapshot,
  needsSnapshot,
  OVERLAY_STATES,
  rebuildDisplayed,
  resetInterruptedOperations,
  resumeAfterDeletion,
  setArchived as recordArchived,
  startRestoreRecovery,
} from '@/relisten/playlists/sync/playlist_sync_state';
import {
  ACCEPTED_STATUSES,
  addedTrackIds,
  type ArchiveStateResponse,
  MAX_BATCH_OPERATIONS,
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
const MAX_BATCH_BYTES = 1.5 * 1024 * 1024;

export interface PlaylistSyncEnvironment {
  account: AccountScopeSnapshot;
  appIsActive: boolean;
  canMakeNetworkRequests: boolean;
}

/** What a failed batch request means for the edits it carried. */
type BatchFailure =
  /** The playlist was archived elsewhere: hold every edit until it is restored. */
  | 'hold'
  /** The account is full: pause the whole outbox until something may make room. */
  | 'pause'
  /** The account no longer has the playlist: create it again from this device. */
  | 'recreate'
  /** The request was too large: send fewer at a time. */
  | 'split'
  /** The server will refuse these edits every time: show them, keep syncing the rest. */
  | 'refuse'
  /** Transport or server trouble: resend later, unchanged. */
  | 'retry';

/**
 * Sends account playlists' create commands and edits, and pulls their changes.
 *
 * A run works for one account capture: it sends create commands, then each
 * playlist's pending edits in order, then pulls every playlist this device is
 * behind on. Every request and every write first checks that the capture is
 * still the signed-in account, so a switch mid-run stops the run before it can
 * touch the previous account's data with the new account's session.
 *
 * Runs are driven by Realm listeners on the outbox, commands and playlist sync
 * fields. Writes made during a run fire those listeners, which set
 * `rerunRequested`, and the loop goes around again: that is how edits held
 * behind a create are sent once it lands, and how a restore's resends happen
 * before its snapshots. A pass that writes nothing ends the loop.
 *
 * Edits stay in the outbox until a pull confirms them, so a lost response is
 * simply resent with the same IDs and replayed by the server.
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
    private readonly api: AuthorizedAccountsApiClient,
    private readonly scopes: AccountScopeSource
  ) {
    this.operations = realm.objects(PlaylistOperation);
    this.commands = realm.objects(PlaylistCommand);
    this.playlists = realm.objects(Playlist).filtered('ownerUserId != null');
  }

  start() {
    if (this.started) {
      return;
    }
    this.started = true;
    this.operations.addListener(this.requestRun);
    this.commands.addListener(this.requestRun);
    this.playlists.addListener(this.requestRun, [
      'summaryRevision',
      'appliedRevision',
      'serverState',
      'archived',
    ]);
  }

  stop() {
    if (!this.started) {
      return;
    }
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
   * queued, so this throws when it cannot reach the account. The caller checks
   * that the playlist belongs to the signed-in account.
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
      if (playlist) {
        recordArchived(this.realm, playlist, response.archived);
      }
    });
    this.flush();
  }

  /** Drops edits held because the playlist was deleted on another device. */
  discardHeldEdits(playlistId: string) {
    this.realm.write(() => {
      this.realm.delete(
        this.operations.filtered('playlistId == $0 AND state == $1', playlistId, 'archived_hold')
      );
      rebuildDisplayed(this.realm, playlistId);
    });
  }

  /** Clears the notice for edits the server refused. */
  dismissRefused(playlistId: string) {
    this.realm.write(() => {
      this.realm.delete(
        this.operations.filtered('playlistId == $0 AND state == $1', playlistId, 'needs_attention')
      );
    });
  }

  private readonly requestRun = () => {
    if (!this.started || !this.canRun()) {
      return;
    }
    if (this.running) {
      this.rerunRequested = true;
      return;
    }
    // Realm listeners can fire while the write that woke them is unwinding.
    queueMicrotask(() => void this.run());
  };

  private async run() {
    if (this.running || !this.canRun()) {
      return;
    }
    this.running = true;
    clearTimeout(this.timer);
    this.timer = undefined;

    try {
      const capture = this.scopes.capture();
      const userId = capture.userId;
      if (!capture.isAuthenticated || !userId) {
        return;
      }
      // Nothing is in flight between runs, so anything marked so was interrupted.
      this.write(capture, () => resetInterruptedOperations(this.realm, userId));

      do {
        this.rerunRequested = false;
        if (Date.now() < this.retryAt) {
          this.schedule(this.retryAt - Date.now());
          return;
        }

        const waitMs = this.quietPeriodRemaining(userId);
        if (this.flushRequested || waitMs <= 0) {
          this.flushRequested = false;
          await this.sendCreateCommands(capture, userId);
          await this.sendEdits(capture, userId);
        } else {
          this.schedule(waitMs);
        }
        await this.pull(capture, userId);
      } while (this.rerunRequested && this.canRun());
    } catch (error) {
      if (error instanceof StaleAccountScopeError) {
        // The account changed; the new account's run starts on its own.
        return;
      }
      logger.warn(`playlist sync paused: ${describe(error)}`);
      this.retryAt = Date.now() + RETRY_DELAY_MS;
      this.schedule(RETRY_DELAY_MS);
    } finally {
      this.running = false;
      if (this.rerunRequested) {
        this.requestRun();
      }
    }
  }

  /** Milliseconds until the newest unsent edit or command has been quiet long enough. */
  private quietPeriodRemaining(userId: string): number {
    const newest = Math.max(
      newestCreatedAt(
        this.operations.filtered('ownerUserId == $0 AND state == $1', userId, 'pending')
      ),
      newestCreatedAt(
        this.commands.filtered('ownerUserId == $0 AND state == $1', userId, 'pending')
      )
    );
    return newest + SEND_DELAY_MS - Date.now();
  }

  // region Session fencing

  /** Requests only for the captured account; an error is rethrown only if it is still current. */
  private async request<T>(capture: AccountScopeCapture, path: string, init?: RequestInit) {
    this.assertCurrent(capture);
    try {
      return await this.api.request<T>(path, init);
    } finally {
      this.assertCurrent(capture);
    }
  }

  private write<T>(capture: AccountScopeCapture, callback: () => T): T {
    this.assertCurrent(capture);
    return this.realm.write(callback);
  }

  private assertCurrent(capture: AccountScopeCapture) {
    if (!this.scopes.isCurrent(capture)) {
      throw new StaleAccountScopeError();
    }
  }

  // endregion

  // region Create commands

  private async sendCreateCommands(capture: AccountScopeCapture, userId: string) {
    const pending = [
      ...this.commands
        .filtered('ownerUserId == $0 AND state == $1', userId, 'pending')
        .sorted('createdAt'),
    ];
    for (const command of pending) {
      const { commandId, playlistId, requestJson } = command;
      this.write(capture, () => {
        command.attemptCount += 1;
      });

      let outcome: 'created' | 'refused' = 'created';
      let code: string | null = null;
      try {
        await this.request(capture, '/v1/playlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestJson,
        });
      } catch (error) {
        code = problemCode(error);
        // `id_conflict` means an earlier attempt already created it.
        if (code === 'id_conflict') {
          outcome = 'created';
        } else if (isPermanentRejection(error)) {
          outcome = 'refused';
        } else {
          throw error;
        }
      }
      this.write(capture, () => this.finishCreate(commandId, playlistId, outcome, code));
    }
  }

  /**
   * A created playlist needs a snapshot, so the server's ranks replace the
   * provisional ones and edits made meanwhile replay on top. A refused create
   * keeps the playlist on the device and says why (usually a full account).
   */
  private finishCreate(
    commandId: string,
    playlistId: string,
    outcome: 'created' | 'refused',
    code: string | null
  ) {
    const command = this.realm.objectForPrimaryKey(PlaylistCommand, commandId);
    const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
    if (playlist) {
      playlist.serverState = outcome === 'created' ? 'synced' : 'needs_attention';
      markNeedsSnapshot(playlist);
    }
    if (!command) {
      return;
    }
    if (outcome === 'created') {
      this.realm.delete(command);
    } else {
      command.state = 'needs_attention';
      command.lastErrorCode = code ?? 'rejected';
    }
  }

  // endregion

  // region Edits

  private async sendEdits(capture: AccountScopeCapture, userId: string) {
    const playlistIds = new Set(
      this.operations
        .filtered('ownerUserId == $0 AND state == $1', userId, 'pending')
        .map((op) => op.playlistId)
    );
    for (const playlistId of playlistIds) {
      const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
      // Edits wait behind the create command.
      if (!playlist || playlist.serverState !== 'synced') {
        continue;
      }
      while (await this.sendBatch(capture, playlistId)) {
        // Drain this playlist's outbox in bounded batches.
      }
    }
  }

  /** Sends the oldest pending edits for one playlist. Returns whether more are waiting. */
  private async sendBatch(capture: AccountScopeCapture, playlistId: string): Promise<boolean> {
    const batch = this.write(capture, () => this.prepareBatch(playlistId));
    if (batch.length === 0) {
      return false;
    }
    const ids = batch.map((op) => op.operation_id);

    let response: OperationBatchResponse;
    try {
      response = await this.request<OperationBatchResponse>(
        capture,
        `/v1/playlists/${playlistId}/operations:batch`,
        jsonRequest('POST', { contract_version: 1, operations: batch })
      );
    } catch (error) {
      const failure = classifyBatchFailure(error, ids.length, this.batchLimit);
      this.write(capture, () => this.applyBatchFailure(playlistId, ids, failure, error));
      if (failure === 'retry') {
        throw error;
      }
      return failure === 'split';
    }

    this.batchLimit = MAX_BATCH_OPERATIONS;
    this.write(capture, () => this.applyBatchResults(playlistId, response));
    return (
      this.operations.filtered('playlistId == $0 AND state == $1', playlistId, 'pending').length > 0
    );
  }

  /** Marks the oldest pending edits in flight, within the batch limits. Runs in a write. */
  private prepareBatch(playlistId: string): WireOperation[] {
    const pending = this.operations
      .filtered('playlistId == $0 AND state == $1', playlistId, 'pending')
      .sorted('localSequence');
    const batch: WireOperation[] = [];
    let bytes = 0;
    for (const op of pending) {
      bytes += op.operationJson.length;
      if (batch.length >= this.batchLimit || (batch.length > 0 && bytes > MAX_BATCH_BYTES)) {
        break;
      }
      op.state = 'in_flight';
      op.attemptCount += 1;
      batch.push(
        toWireOperation(
          op.operationId,
          op.baseRevision,
          JSON.parse(op.operationJson) as PlaylistEdit
        )
      );
    }
    return batch;
  }

  /** Records each edit's result, then rebuilds. Runs in a write. */
  private applyBatchResults(playlistId: string, response: OperationBatchResponse) {
    const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
    if (!playlist) {
      return;
    }
    if (playlist.historyGeneration && playlist.historyGeneration !== response.history_generation) {
      startRestoreRecovery(this.realm, playlist.ownerUserId!);
      return;
    }

    let deleted = false;
    for (const result of response.results) {
      const op = this.realm.objectForPrimaryKey(PlaylistOperation, result.operation_id);
      if (!op) {
        continue;
      }
      const edit = JSON.parse(op.operationJson) as PlaylistEdit;
      if (result.status === 'applied' && result.revision !== null) {
        op.state = 'acknowledged';
        op.resultRevision = result.revision;
        op.resultGeneration = response.history_generation;
        deleted ||= edit.type === 'delete_entry' || edit.type === 'delete_segment';
      } else if (ACCEPTED_STATUSES.has(result.status)) {
        // Accepted without a revision: nothing will arrive to confirm it.
        this.realm.delete(op);
      } else {
        // The edit's intent did not land. Additions are offered again.
        op.state = 'needs_attention';
        op.lastErrorCode = result.status;
        op.failedTrackIds.push(...addedTrackIds(edit));
      }
    }
    if (deleted) {
      resumeAfterDeletion(this.realm, playlist.ownerUserId!);
    }
    playlist.summaryRevision = Math.max(playlist.summaryRevision ?? 0, response.head_revision);
    rebuildDisplayed(this.realm, playlistId);
  }

  /** Moves the batch's edits to the state the failure calls for. Runs in a write. */
  private applyBatchFailure(
    playlistId: string,
    ids: string[],
    failure: BatchFailure,
    error: unknown
  ) {
    const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
    const unsent = this.operations.filtered('playlistId == $0 AND state IN $1', playlistId, [
      'pending',
      'in_flight',
    ]);
    const sent = ids
      .map((id) => this.realm.objectForPrimaryKey(PlaylistOperation, id))
      .filter((op): op is PlaylistOperation => op !== null && op.state === 'in_flight');

    switch (failure) {
      case 'hold':
        for (const op of [...unsent]) {
          op.state = 'archived_hold';
        }
        if (playlist) {
          playlist.archived = true;
        }
        return;
      case 'pause':
        for (const op of [...unsent]) {
          op.state = 'quota_paused';
        }
        return;
      case 'recreate':
        if (playlist) {
          this.recreate(playlist);
        }
        return;
      case 'refuse':
        for (const op of sent) {
          op.state = 'needs_attention';
          op.lastErrorCode = problemCode(error) ?? 'rejected';
        }
        rebuildDisplayed(this.realm, playlistId);
        return;
      case 'split':
        this.batchLimit = Math.max(1, Math.floor(ids.length / 2));
        for (const op of sent) {
          op.state = 'pending';
        }
        return;
      case 'retry':
        for (const op of sent) {
          op.state = 'pending';
        }
        return;
    }
  }

  // endregion

  // region Pull

  /**
   * Pulls every playlist this device should refresh: those that need a
   * snapshot (new, created, or after a restore), and those whose summary or
   * own acknowledged edits are ahead of what was applied.
   */
  private async pull(capture: AccountScopeCapture, userId: string) {
    const candidates = [
      ...this.playlists.filtered(
        'ownerUserId == $0 AND serverState == $1 AND archived == false',
        userId,
        'synced'
      ),
    ];
    for (const playlist of candidates) {
      if (!playlist.isValid()) {
        continue;
      }
      if (needsSnapshot(playlist)) {
        await this.fetchSnapshot(capture, playlist.playlistId);
      } else if (this.isBehind(playlist)) {
        await this.fetchChanges(capture, playlist.playlistId);
      }
    }
  }

  private isBehind(playlist: Playlist) {
    const applied = playlist.appliedRevision ?? 0;
    if ((playlist.summaryRevision ?? 0) > applied) {
      return true;
    }
    return (
      this.operations.filtered(
        'playlistId == $0 AND state == $1 AND resultRevision > $2',
        playlist.playlistId,
        'acknowledged',
        applied
      ).length > 0
    );
  }

  private async fetchSnapshot(capture: AccountScopeCapture, playlistId: string) {
    let snapshot: PlaylistSnapshotResponse;
    try {
      snapshot = await this.request<PlaylistSnapshotResponse>(
        capture,
        `/v1/playlists/${playlistId}/snapshot`
      );
    } catch (error) {
      if (problemCode(error) !== 'playlist_not_found') {
        throw error;
      }
      this.write(capture, () => {
        const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
        if (playlist) {
          this.recreate(playlist);
        }
      });
      return;
    }

    this.write(capture, () => {
      const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
      if (!playlist) {
        return;
      }
      // An edit acknowledged in another generation proves nothing about this
      // snapshot: the server was restored, so resend held edits first.
      const staleAcknowledgements = this.operations.filtered(
        'playlistId == $0 AND state == $1 AND resultGeneration != $2',
        playlistId,
        'acknowledged',
        snapshot.history_generation
      );
      if (staleAcknowledgements.length > 0) {
        startRestoreRecovery(this.realm, playlist.ownerUserId!);
        return;
      }
      applySnapshot(this.realm, playlist, snapshot);
    });
  }

  private async fetchChanges(capture: AccountScopeCapture, playlistId: string) {
    for (;;) {
      const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
      if (!playlist || needsSnapshot(playlist)) {
        return;
      }
      let page: PlaylistChangesResponse;
      try {
        page = await this.request<PlaylistChangesResponse>(
          capture,
          `/v1/playlists/${playlistId}/changes?after_revision=${playlist.appliedRevision}`
        );
      } catch (error) {
        if (problemCode(error) !== 'snapshot_required') {
          throw error;
        }
        // The server's history is behind this device: treat it as a restore.
        this.write(capture, () => startRestoreRecovery(this.realm, playlist.ownerUserId!));
        return;
      }

      const more = this.write(capture, () => {
        const current = this.realm.objectForPrimaryKey(Playlist, playlistId);
        if (!current) {
          return false;
        }
        if (current.historyGeneration !== page.history_generation) {
          startRestoreRecovery(this.realm, current.ownerUserId!);
          return false;
        }
        applyChangesPage(this.realm, current, page);
        return page.has_more;
      });
      if (!more) {
        return;
      }
    }
  }

  /** The account lost the playlist: create it again from what this device shows. Runs in a write. */
  private recreate(playlist: Playlist) {
    this.realm.delete(
      this.operations.filtered(
        'playlistId == $0 AND state IN $1',
        playlist.playlistId,
        OVERLAY_STATES
      )
    );
    issueCreateCommand(this.realm, playlist);
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

function classifyBatchFailure(error: unknown, size: number, limit: number): BatchFailure {
  const code = problemCode(error);
  if (code === 'playlist_archived') {
    return 'hold';
  }
  if (code === 'quota_exceeded') {
    return 'pause';
  }
  if (code === 'playlist_not_found') {
    return 'recreate';
  }
  if (error instanceof AccountsApiError && error.status === 413) {
    // A single edit that is still too large will never fit.
    return size > 1 && limit > 1 ? 'split' : 'refuse';
  }
  return isPermanentRejection(error) ? 'refuse' : 'retry';
}

function newestCreatedAt<T extends { createdAt: Date }>(rows: Realm.Results<T>): number {
  const newest = rows.sorted('createdAt', true)[0];
  return newest ? newest.createdAt.getTime() : Number.NEGATIVE_INFINITY;
}

function jsonRequest(method: 'POST' | 'PUT', body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function problemCode(error: unknown): string | null {
  return error instanceof AccountsApiError ? error.code : null;
}

/** A 4xx the server will answer the same way every time; resending cannot help. */
function isPermanentRejection(error: unknown) {
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
