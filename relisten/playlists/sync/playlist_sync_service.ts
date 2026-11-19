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
import {
  isPermanentRejection,
  jsonRequest,
  problemCode,
} from '@/relisten/playlists/sharing/accounts_http';
import {
  applyFollowedSnapshot,
  followsNeedingSnapshot,
  isFollowedBy,
  markFollowUnavailable,
} from '@/relisten/playlists/sharing/followed_playlists';
import { fetchPublicSnapshot, requestCopy } from '@/relisten/playlists/sharing/sharing_requests';
import { dropCopyCommand, finishCopy } from '@/relisten/playlists/sharing/playlist_copies';
import { PlaylistCopyCommand } from '@/relisten/realm/models/playlists/playlist';
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
/**
 * Opening a playlist checks the account for other devices' changes to it,
 * unless it was checked this recently. The library feed covers everything else
 * when the app comes to the foreground.
 */
const OPEN_CHECK_INTERVAL_MS = 30_000;
const MAX_BATCH_BYTES = 1.5 * 1024 * 1024;
/**
 * Followed playlists whose owner changed them are fetched after each sync, so
 * they're ready offline, at most this many per run. The rest are fetched when
 * opened, or on a later run.
 */
const FOLLOWED_SNAPSHOTS_PER_RUN = 20;
/** How many owned playlists' snapshots are requested at once. */
const SNAPSHOT_CONCURRENCY = 4;
/**
 * How long a followed playlist waits after a fetch that failed or was out of
 * date. The edge caches public snapshots for about a minute, so asking sooner
 * gets the same answer.
 */
const FOLLOWED_RETRY_DELAY_MS = 60_000;

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
 * A run works for one account capture: it resends unfinished copies, sends
 * create commands, then each playlist's pending edits in order, then pulls
 * every owned playlist this device is behind on, then followed playlists.
 * A failure in the owned steps pauses the whole run for a retry. Copies and
 * followed playlists fail one at a time and never hold up owned playlists.
 * Every request and every write first checks that the capture is
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
  private timerDueAt = 0;
  private retryAt = 0;
  /** Lowered after a 413 so an oversized batch is split; restored after a success. */
  private batchLimit = MAX_BATCH_OPERATIONS;
  /** Followed snapshots this run may still fetch without being asked. */
  private followedBudget = FOLLOWED_SNAPSHOTS_PER_RUN;
  /**
   * When a followed playlist may be fetched again after a fetch that didn't
   * bring it up to date. Kept in memory only: a restart just fetches again.
   */
  private readonly followedRetryAt = new Map<string, number>();
  /** Playlists whose screen opened and should be checked on the next pull. */
  private readonly checkRequested = new Set<string>();
  private readonly lastChecked = new Map<string, number>();
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
    this.playlists = realm.objects(Playlist).filtered('libraryUserId != null');
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
    this.timer = undefined;
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

  /**
   * Called when a playlist's screen opens. An owned playlist is checked for
   * other devices' changes, at most every 30 seconds. A followed playlist is
   * not checked with the server here: news of the owner's edits comes only
   * from the library feed. If the feed already said its copy is behind, the
   * copy is fetched on the next run even when the run's budget is spent.
   */
  checkForChanges(playlistId: string) {
    if (Date.now() - (this.lastChecked.get(playlistId) ?? 0) < OPEN_CHECK_INTERVAL_MS) {
      return;
    }
    this.checkRequested.add(playlistId);
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
      // Checked first, since a write wakes every listener and runs on each edit.
      if (
        this.operations.filtered('libraryUserId == $0 AND state == $1', userId, 'in_flight')
          .length > 0
      ) {
        this.write(capture, () => resetInterruptedOperations(this.realm, userId));
      }
      this.followedBudget = FOLLOWED_SNAPSHOTS_PER_RUN;
      await this.resendCopies(capture, userId);

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
        await this.pullFollowed(capture, userId);
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
        this.operations.filtered('libraryUserId == $0 AND state == $1', userId, 'pending')
      ),
      newestCreatedAt(
        this.commands.filtered('libraryUserId == $0 AND state == $1', userId, 'pending')
      )
    );
    return newest + SEND_DELAY_MS - Date.now();
  }

  // region Session fencing

  /** Requests only for the captured account; an error is rethrown only if it is still current. */
  private request<T>(capture: AccountScopeCapture, path: string, init?: RequestInit) {
    return this.fenced(capture, () => this.api.request<T>(path, init));
  }

  private async fenced<T>(capture: AccountScopeCapture, send: () => Promise<T>): Promise<T> {
    this.assertCurrent(capture);
    try {
      return await send();
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

  // region Copies

  /**
   * Resends copies the app stopped waiting for (a network error, or a restart
   * mid-request). The same command ID returns the copy already made.
   *
   * A copy that fails again keeps its command and is resent on a later run;
   * it doesn't stop the run, so owned playlists sync regardless.
   */
  private async resendCopies(capture: AccountScopeCapture, userId: string) {
    const commands = [
      ...this.realm.objects(PlaylistCopyCommand).filtered('userId == $0', userId),
    ].map(({ commandId, publicCode }) => ({ commandId, publicCode }));

    for (const { commandId, publicCode } of commands) {
      try {
        const created = await this.fenced(capture, () =>
          requestCopy(this.api, publicCode, commandId)
        );
        this.write(capture, () => finishCopy(this.realm, userId, commandId, created));
      } catch (error) {
        if (error instanceof StaleAccountScopeError) {
          throw error;
        }
        if (isPermanentRejection(error)) {
          this.write(capture, () => dropCopyCommand(this.realm, commandId));
          continue;
        }
        logger.warn(`playlist copy not finished: ${describe(error)}`);
        this.schedule(RETRY_DELAY_MS);
      }
    }
  }

  // endregion

  // region Create commands

  private async sendCreateCommands(capture: AccountScopeCapture, userId: string) {
    const pending = [
      ...this.commands
        .filtered('libraryUserId == $0 AND state == $1', userId, 'pending')
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
        .filtered('libraryUserId == $0 AND state == $1', userId, 'pending')
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
    this.write(capture, () => this.applyBatchResults(playlistId, batch, response));
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

  /**
   * Records each sent edit's result. Runs in a write.
   *
   * An acknowledged edit stays in the overlay until a pull confirms it, so the
   * displayed state is already right and is not rebuilt. An edit that leaves
   * the overlay (accepted with nothing to confirm, or refused) is no longer
   * replayed, and that does call for a rebuild.
   */
  private applyBatchResults(
    playlistId: string,
    batch: WireOperation[],
    response: OperationBatchResponse
  ) {
    const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
    if (!playlist) {
      return;
    }
    if (playlist.historyGeneration && playlist.historyGeneration !== response.history_generation) {
      startRestoreRecovery(this.realm, playlist.libraryUserId!);
      return;
    }

    const sentTypes = new Map(batch.map((sent) => [sent.operation_id, sent.operation_type]));
    let deleted = false;
    let overlayChanged = false;

    for (const result of response.results) {
      const op = this.realm.objectForPrimaryKey(PlaylistOperation, result.operation_id);
      if (!op) {
        continue;
      }
      if (result.status === 'applied' && result.revision !== null) {
        op.state = 'acknowledged';
        op.resultRevision = result.revision;
        op.resultGeneration = response.history_generation;
        const type = sentTypes.get(result.operation_id);
        deleted ||= type === 'delete_entry' || type === 'delete_segment';
      } else if (ACCEPTED_STATUSES.has(result.status)) {
        // Accepted without a revision: nothing will arrive to confirm it.
        this.realm.delete(op);
        overlayChanged = true;
      } else {
        // The edit's intent did not land. The sync notice offers its additions again.
        op.state = 'needs_attention';
        op.lastErrorCode = result.status;
        overlayChanged = true;
      }
    }

    if (deleted) {
      resumeAfterDeletion(this.realm, playlist.libraryUserId!);
    }
    if ((playlist.summaryRevision ?? 0) < response.head_revision) {
      playlist.summaryRevision = response.head_revision;
    }
    if (overlayChanged) {
      rebuildDisplayed(this.realm, playlistId);
    }
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
   * snapshot (new, created, or after a restore), those whose summary or own
   * acknowledged edits are ahead of what was applied, and any whose screen
   * just opened. Playlists with an open screen go first in each step.
   */
  private async pull(capture: AccountScopeCapture, userId: string) {
    // Open checks are cleared one at a time as they run, so a pass that fails
    // partway leaves the rest for the next run.
    const requested = new Set(this.checkRequested);
    const acknowledged = this.acknowledgedRevisions(userId);
    const owned = [
      ...this.playlists.filtered(
        'libraryUserId == $0 AND access == $1 AND serverState == $2 AND archived == false',
        userId,
        'owner',
        'synced'
      ),
    ];
    const openFirst = [
      ...owned.filter((playlist) => requested.has(playlist.playlistId)),
      ...owned.filter((playlist) => !requested.has(playlist.playlistId)),
    ];
    const toSnapshot = openFirst.filter(needsSnapshot).map((playlist) => playlist.playlistId);
    const toCatchUp = openFirst
      .filter(
        (playlist) =>
          !needsSnapshot(playlist) &&
          (isBehind(playlist, acknowledged) || requested.has(playlist.playlistId))
      )
      .map((playlist) => playlist.playlistId);

    // Catching up is a few small requests; snapshots can be a whole library
    // on a new device, so they go last.
    for (const playlistId of toCatchUp) {
      await this.fetchChanges(capture, playlistId);
      this.markChecked(playlistId);
    }
    await this.fetchSnapshots(capture, toSnapshot);
  }

  private markChecked(playlistId: string) {
    this.checkRequested.delete(playlistId);
    this.lastChecked.set(playlistId, Date.now());
  }

  /**
   * The newest revision the server gave each playlist's acknowledged edits,
   * from one query per pass rather than one per playlist: every edit wakes a
   * run, so `pull` runs often.
   */
  private acknowledgedRevisions(userId: string): Map<string, number> {
    const revisions = new Map<string, number>();
    for (const op of this.operations.filtered(
      'libraryUserId == $0 AND state == $1',
      userId,
      'acknowledged'
    )) {
      if (op.resultRevision != null) {
        revisions.set(
          op.playlistId,
          Math.max(revisions.get(op.playlistId) ?? 0, op.resultRevision)
        );
      }
    }
    return revisions;
  }

  /**
   * Fetches snapshots a few at a time, so a new device's first sync doesn't
   * wait on one request per playlist in turn. Only the requests overlap: each
   * group's snapshots are stored one after another, in order. A request that
   * fails doesn't cost its group the snapshots that arrived; those are stored,
   * then the failure stops the pass as it would alone, and the rest are
   * fetched on the retry.
   */
  private async fetchSnapshots(capture: AccountScopeCapture, playlistIds: string[]) {
    for (let start = 0; start < playlistIds.length; start += SNAPSHOT_CONCURRENCY) {
      const group = playlistIds.slice(start, start + SNAPSHOT_CONCURRENCY);
      const results = await Promise.allSettled(
        group.map((playlistId) => this.requestSnapshot(capture, playlistId))
      );

      let failure: PromiseRejectedResult | undefined;
      group.forEach((playlistId, index) => {
        const result = results[index];
        if (result.status === 'rejected') {
          failure ??= result;
          return;
        }
        if (result.value) {
          this.storeSnapshot(capture, playlistId, result.value);
        } else {
          this.recoverMissing(capture, playlistId);
        }
        this.markChecked(playlistId);
      });
      if (failure) {
        throw failure.reason;
      }
    }
  }

  /** The account's snapshot of a playlist, or null if the account no longer has it. */
  private async requestSnapshot(
    capture: AccountScopeCapture,
    playlistId: string
  ): Promise<PlaylistSnapshotResponse | null> {
    try {
      return await this.request<PlaylistSnapshotResponse>(
        capture,
        `/v1/playlists/${playlistId}/snapshot`
      );
    } catch (error) {
      if (problemCode(error) !== 'playlist_not_found') {
        throw error;
      }
      return null;
    }
  }

  private storeSnapshot(
    capture: AccountScopeCapture,
    playlistId: string,
    snapshot: PlaylistSnapshotResponse
  ) {
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
        startRestoreRecovery(this.realm, playlist.libraryUserId!);
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
        const code = problemCode(error);
        if (code === 'playlist_not_found') {
          this.recoverMissing(capture, playlistId);
          return;
        }
        if (code !== 'snapshot_required') {
          throw error;
        }
        // The server's history is behind this device: treat it as a restore.
        this.write(capture, () => startRestoreRecovery(this.realm, playlist.libraryUserId!));
        return;
      }

      const more = this.write(capture, () => {
        const current = this.realm.objectForPrimaryKey(Playlist, playlistId);
        if (!current) {
          return false;
        }
        if (current.historyGeneration !== page.history_generation) {
          startRestoreRecovery(this.realm, current.libraryUserId!);
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

  /**
   * Fetches followed playlists whose head is ahead of the stored copy: the
   * opened ones, then up to the run's budget of the rest. Public snapshots are
   * read without credentials, so the edge can serve them from its cache.
   *
   * Each playlist is fetched on its own. One that fails, or whose snapshot is
   * still behind its head, waits `FOLLOWED_RETRY_DELAY_MS` while the others
   * go ahead, and a run is scheduled for when the wait ends.
   */
  private async pullFollowed(capture: AccountScopeCapture, userId: string) {
    const { due, nextRetryAt: waitingUntil } = this.followsDueNow(userId);
    let nextRetryAt = waitingUntil;

    for (const playlistId of due) {
      if (await this.tryFetchFollowedSnapshot(capture, userId, playlistId)) {
        this.followedRetryAt.delete(playlistId);
      } else {
        this.followedRetryAt.set(playlistId, Date.now() + FOLLOWED_RETRY_DELAY_MS);
        nextRetryAt = Math.min(nextRetryAt, Date.now() + FOLLOWED_RETRY_DELAY_MS);
      }
    }

    if (nextRetryAt !== Infinity) {
      this.schedule(nextRetryAt - Date.now());
    }
  }

  /**
   * The followed playlists to fetch now: opened ones, then the rest up to the
   * run's budget, skipping any still waiting out a retry. `nextRetryAt` is the
   * earliest of those waits, or Infinity.
   */
  private followsDueNow(userId: string) {
    const opened = this.takeOpenedFollows(userId);
    const now = Date.now();
    const due: string[] = [];
    let nextRetryAt = Infinity;

    for (const playlist of followsNeedingSnapshot(this.realm, userId)) {
      const playlistId = playlist.playlistId;
      const retryAt = this.followedRetryAt.get(playlistId) ?? 0;
      if (retryAt > now) {
        nextRetryAt = Math.min(nextRetryAt, retryAt);
      } else if (opened.has(playlistId)) {
        due.push(playlistId);
      } else if (this.followedBudget > 0) {
        this.followedBudget -= 1;
        due.push(playlistId);
      }
    }
    return { due, nextRetryAt };
  }

  /**
   * Takes the followed playlists out of the open checks and returns them.
   * `pull` only clears owned playlists' checks, and follows don't record
   * `lastChecked`, so opening one always asks for a fetch.
   */
  private takeOpenedFollows(userId: string): Set<string> {
    const opened = new Set<string>();
    for (const playlistId of this.checkRequested) {
      const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
      if (playlist && isFollowedBy(playlist, userId)) {
        this.checkRequested.delete(playlistId);
        opened.add(playlistId);
      }
    }
    return opened;
  }

  /**
   * Fetches one followed playlist, turning a failure into "fetch again after
   * a wait" (false). An account switch still stops the run.
   */
  private async tryFetchFollowedSnapshot(
    capture: AccountScopeCapture,
    userId: string,
    playlistId: string
  ): Promise<boolean> {
    try {
      return await this.fetchFollowedSnapshot(capture, userId, playlistId);
    } catch (error) {
      if (error instanceof StaleAccountScopeError) {
        throw error;
      }
      logger.warn(`followed playlist not fetched: ${describe(error)}`);
      return false;
    }
  }

  /** Fetches and stores one followed playlist's snapshot. Returns whether the follow is settled. */
  private async fetchFollowedSnapshot(
    capture: AccountScopeCapture,
    userId: string,
    playlistId: string
  ): Promise<boolean> {
    const publicCode = this.realm.objectForPrimaryKey(Playlist, playlistId)?.publicCode;
    if (!publicCode) {
      return true;
    }

    const snapshot = await this.fenced(capture, () => fetchPublicSnapshot(this.api, publicCode));

    return this.write(capture, () => {
      const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
      if (!playlist || !isFollowedBy(playlist, userId)) {
        return true;
      }
      // A 404 means it is private, taken down or deleted. A code that answers
      // with another playlist means the head and the public page disagree, and
      // fetching again can't settle that. Either way the follow shows as
      // unavailable until a later head from the library feed makes it
      // available again, which allows one more fetch.
      if (!snapshot || snapshot.playlist_id !== playlistId) {
        markFollowUnavailable(playlist);
        return true;
      }
      return applyFollowedSnapshot(this.realm, userId, snapshot);
    });
  }

  /**
   * The account says a playlist this device saw confirmed doesn't exist. An
   * archived playlist is purged by the server in time, so only a live one is
   * treated as lost to a restore and created again; one already being
   * recreated is left to that create.
   */
  private recoverMissing(capture: AccountScopeCapture, playlistId: string) {
    this.write(capture, () => {
      const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
      if (playlist && playlist.serverState === 'synced' && !playlist.archived) {
        this.recreate(playlist);
      }
    });
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

  /**
   * Starts a run after `delayMs`, unless one is already due sooner. Each run
   * clears the timer and schedules again whatever it still waits for, so the
   * quiet period, the retry pause and followed-playlist waits can share it.
   */
  private schedule(delayMs: number) {
    const dueAt = Date.now() + Math.max(0, delayMs);
    if (this.timer !== undefined && this.timerDueAt <= dueAt) {
      return;
    }
    clearTimeout(this.timer);
    this.timerDueAt = dueAt;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.requestRun();
    }, dueAt - Date.now());
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

function describe(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
}

/** Whether the account has a newer revision than the one applied: in its summary, or from this device's own acknowledged edits. */
function isBehind(playlist: Playlist, acknowledged: Map<string, number>) {
  const applied = playlist.appliedRevision ?? 0;
  return (
    (playlist.summaryRevision ?? 0) > applied ||
    (acknowledged.get(playlist.playlistId) ?? 0) > applied
  );
}
