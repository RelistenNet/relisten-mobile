import Realm from 'realm';
import {
  Playlist,
  PlaylistCommand,
  PLAYLIST_DEVICE_STATE_ID,
  PlaylistDeviceState,
  PlaylistEntry,
  PlaylistOperation,
  type PlaylistOperationState,
  PlaylistSegment,
} from '@/relisten/realm/models/playlists/playlist';
import {
  applyPlaylistOperation,
  type EntryState,
  orderedGroups,
  type PlaylistChanges,
  type SegmentState,
} from '@/relisten/playlists/playlist_operations';
import type {
  CreatePlaylistRequest,
  MetadataEdit,
  PlaylistChangesResponse,
  PlaylistEdit,
  PlaylistSnapshotResponse,
  PlaylistSummary,
} from '@/relisten/playlists/sync/playlist_wire';
import { createUuidV7TypedId } from '@/relisten/util/typed_uuid_id';

/**
 * Durable sync state for account playlists. Every function here runs inside a
 * Realm write owned by its caller.
 *
 * Each row keeps two states. The canonical fields hold what the server last
 * confirmed. The displayed fields (`segmentId`, `rank`, `live`, and the
 * playlist's `name` and `description`) hold the canonical state with the
 * owner's unconfirmed operations replayed on top, in order. A listener's edit
 * changes the displayed fields directly and appends an operation; a pull
 * changes the canonical fields and rebuilds the displayed ones.
 */

/** Operations still in the overlay: replayed over the canonical state on every rebuild. */
export const OVERLAY_STATES: PlaylistOperationState[] = [
  'pending',
  'in_flight',
  'acknowledged',
  'quota_paused',
  'archived_hold',
];

// region Device state and ownership

export function deviceState(realm: Realm): PlaylistDeviceState {
  return (
    realm.objectForPrimaryKey(PlaylistDeviceState, PLAYLIST_DEVICE_STATE_ID) ??
    realm.create(PlaylistDeviceState, { id: PLAYLIST_DEVICE_STATE_ID })
  );
}

/** The account whose playlists are shown: signed in now, or most recently. */
export function visibleOwnerId(realm: Realm): string | undefined {
  return (
    realm.objectForPrimaryKey(PlaylistDeviceState, PLAYLIST_DEVICE_STATE_ID)?.lastSignedInUserId ??
    undefined
  );
}

/**
 * Signing in as `userId` makes it the visible owner and saves every unowned
 * playlist to that account, keeping its IDs. Nothing is copied, so a retried
 * create can never make a duplicate. Deleted device playlists stay unowned and
 * are purged on schedule. Returns how many playlists were claimed.
 */
export function claimUnownedPlaylists(realm: Realm, userId: string): number {
  deviceState(realm).lastSignedInUserId = userId;

  const unowned = [
    ...realm.objects(Playlist).filtered('ownerUserId == null AND deletedAt == null'),
  ];
  for (const playlist of unowned) {
    playlist.ownerUserId = userId;
    issueCreateCommand(realm, playlist);
  }
  return unowned.length;
}

/**
 * Freezes the playlist's current structure into a create command and treats it
 * as the provisional canonical state until the server confirms it.
 */
export function issueCreateCommand(realm: Realm, playlist: Playlist) {
  const segments = liveRows(realm, PlaylistSegment, playlist.playlistId);
  const entries = liveRows(realm, PlaylistEntry, playlist.playlistId);

  playlist.serverState = 'creating';
  playlist.canonicalName = playlist.name;
  playlist.canonicalDescription = playlist.description;
  for (const segment of segments) {
    segment.canonicalRank = segment.rank;
    segment.canonicalLive = true;
  }
  for (const entry of entries) {
    entry.canonicalSegmentId = entry.segmentId;
    entry.canonicalRank = entry.rank;
    entry.canonicalLive = true;
  }

  const groups = orderedGroups({
    segments: new Map(segments.map((s) => [s.segmentId, segmentState(s)])),
    entries: new Map(entries.map((e) => [e.entryId, entryState(e)])),
  });
  const commandId = createUuidV7TypedId('command');
  const request: CreatePlaylistRequest = {
    contract_version: 1,
    command_id: commandId,
    playlist_id: playlist.playlistId,
    metadata: { name: playlist.name, description: playlist.description ?? null },
    segments: groups.map((group) => ({
      segment_id: group.segment.segmentId,
      entries: group.entries.map((e) => ({ entry_id: e.entryId, track_id: e.trackId })),
    })),
  };

  realm.create(PlaylistCommand, {
    commandId,
    playlistId: playlist.playlistId,
    ownerUserId: playlist.ownerUserId!,
    requestJson: JSON.stringify(request),
    state: 'pending',
    createdAt: new Date(),
  });
}

// endregion

// region Listener edits

/**
 * Appends one edit to the owner's outbox. The caller has already applied it to
 * the displayed fields. A paused outbox is released, since the account limit is
 * checked against the whole outbox and this edit may be what makes it fit.
 */
export function appendOperation(realm: Realm, playlist: Playlist, edit: PlaylistEdit): string {
  const state = deviceState(realm);
  const operationId = createUuidV7TypedId('playlist_operation');

  realm.create(PlaylistOperation, {
    operationId,
    playlistId: playlist.playlistId,
    ownerUserId: playlist.ownerUserId!,
    localSequence: state.nextOperationSequence,
    operationJson: JSON.stringify(edit),
    baseRevision: playlist.appliedRevision ?? 0,
    state: 'pending',
    createdAt: new Date(),
  });
  state.nextOperationSequence += 1;

  for (const paused of realm
    .objects(PlaylistOperation)
    .filtered('playlistId == $0 AND state == $1', playlist.playlistId, 'quota_paused')) {
    paused.state = 'pending';
  }
  return operationId;
}

/**
 * Writes an applied operation's changes to the displayed fields. In an account
 * playlist a row the server still has is hidden rather than deleted, because
 * its canonical fields are still needed.
 */
export function writeDisplayedChanges(realm: Realm, playlist: Playlist, changes: PlaylistChanges) {
  const playlistId = playlist.playlistId;
  for (const segment of changes.upsertSegments) {
    realm.create(
      PlaylistSegment,
      { ...segment, playlistId, live: true },
      Realm.UpdateMode.Modified
    );
  }
  for (const entry of changes.upsertEntries) {
    realm.create(PlaylistEntry, { ...entry, playlistId, live: true }, Realm.UpdateMode.Modified);
  }
  for (const entryId of changes.deleteEntryIds) {
    hideOrDelete(realm, realm.objectForPrimaryKey(PlaylistEntry, entryId));
  }
  for (const segmentId of changes.deleteSegmentIds) {
    hideOrDelete(realm, realm.objectForPrimaryKey(PlaylistSegment, segmentId));
  }
}

function hideOrDelete(realm: Realm, row: PlaylistEntry | PlaylistSegment | null) {
  if (!row) return;
  if (row.canonicalLive) {
    row.live = false;
  } else {
    realm.delete(row);
  }
}

/** Removes unsent operations, for Undo. Returns false if any was already sent. */
export function withdrawUnsentOperations(
  realm: Realm,
  playlistId: string,
  operationIds: string[]
): boolean {
  const operations = operationIds.map((id) => realm.objectForPrimaryKey(PlaylistOperation, id));
  if (operations.some((op) => !op || op.state !== 'pending' || op.attemptCount > 0)) {
    return false;
  }
  realm.delete(operations as PlaylistOperation[]);
  rebuildDisplayed(realm, playlistId);
  return true;
}

// endregion

// region Rebuild

/**
 * Resets the displayed fields to the canonical state and replays every
 * operation still in the overlay. Computes in memory, then writes only fields
 * whose value changed, so a pull that changed nothing visible writes nothing.
 */
export function rebuildDisplayed(realm: Realm, playlistId: string) {
  const playlist = realm.objectForPrimaryKey(Playlist, playlistId);
  if (!playlist) return;

  const segmentRows = [...realm.objects(PlaylistSegment).filtered('playlistId == $0', playlistId)];
  const entryRows = [...realm.objects(PlaylistEntry).filtered('playlistId == $0', playlistId)];
  const segments = new Map<string, SegmentState>();
  const entries = new Map<string, EntryState>();
  for (const row of segmentRows) {
    if (row.canonicalLive)
      segments.set(row.segmentId, { segmentId: row.segmentId, rank: row.canonicalRank! });
  }
  for (const row of entryRows) {
    if (row.canonicalLive) {
      entries.set(row.entryId, {
        entryId: row.entryId,
        segmentId: row.canonicalSegmentId!,
        trackId: row.trackId,
        rank: row.canonicalRank!,
      });
    }
  }

  let name = playlist.canonicalName ?? playlist.name;
  let description = playlist.canonicalDescription;
  for (const edit of overlayEdits(realm, playlistId)) {
    if (edit.type === 'update_metadata') {
      ({ name, description } = applyMetadata({ name, description }, edit));
      continue;
    }
    const outcome = applyPlaylistOperation({ segments, entries }, edit);
    for (const segment of outcome.changes.upsertSegments) segments.set(segment.segmentId, segment);
    for (const entry of outcome.changes.upsertEntries) entries.set(entry.entryId, entry);
    for (const id of outcome.changes.deleteEntryIds) entries.delete(id);
    for (const id of outcome.changes.deleteSegmentIds) segments.delete(id);
  }

  writeRebuilt(
    realm,
    playlistId,
    PlaylistSegment,
    segmentRows,
    segments,
    (row) => row.segmentId,
    (row, state) => {
      if (row.rank !== state.rank) row.rank = state.rank;
    }
  );
  writeRebuilt(
    realm,
    playlistId,
    PlaylistEntry,
    entryRows,
    entries,
    (row) => row.entryId,
    (row, state) => {
      if (row.rank !== state.rank) row.rank = state.rank;
      if (row.segmentId !== state.segmentId) row.segmentId = state.segmentId;
    }
  );

  if (playlist.name !== name) playlist.name = name;
  if ((playlist.description ?? undefined) !== (description ?? undefined)) {
    playlist.description = description;
  }
  if (playlist.entryCount !== entries.size) playlist.entryCount = entries.size;
}

function writeRebuilt<Row extends PlaylistSegment | PlaylistEntry, State>(
  realm: Realm,
  playlistId: string,
  type: typeof PlaylistSegment | typeof PlaylistEntry,
  rows: Row[],
  states: Map<string, State>,
  idOf: (row: Row) => string,
  update: (row: Row, state: State) => void
) {
  const seen = new Set<string>();
  for (const row of rows) {
    const id = idOf(row);
    const state = states.get(id);
    seen.add(id);
    if (state) {
      if (!row.live) row.live = true;
      update(row, state);
    } else if (row.canonicalLive) {
      if (row.live) row.live = false;
    } else {
      // Neither confirmed nor in the overlay: an edit that was withdrawn or refused.
      realm.delete(row);
    }
  }
  // Rows always exist for overlay items, since edits write them; this covers
  // an overlay replayed after its rows were lost to a restore.
  for (const [id, state] of states) {
    if (seen.has(id)) continue;
    realm.create(type.schema.name, { ...state, playlistId, live: true });
  }
}

function overlayEdits(realm: Realm, playlistId: string): PlaylistEdit[] {
  return realm
    .objects(PlaylistOperation)
    .filtered('playlistId == $0 AND state IN $1', playlistId, OVERLAY_STATES)
    .sorted('localSequence')
    .map((op) => JSON.parse(op.operationJson) as PlaylistEdit);
}

function applyMetadata(
  current: { name: string; description?: string },
  edit: MetadataEdit
): { name: string; description?: string } {
  return {
    name: edit.name ?? current.name,
    description:
      edit.description === undefined ? current.description : (edit.description ?? undefined),
  };
}

// endregion

// region Applying server state

/**
 * Records playlist summaries from the library feed. A playlist new to this
 * device becomes a row with no canonical state yet, which the playlist sync
 * fetches by snapshot; a known one notes the newer revision so it is pulled.
 */
export function applyPlaylistSummaries(
  realm: Realm,
  ownerUserId: string,
  summaries: PlaylistSummary[]
) {
  for (const summary of summaries) {
    const playlist = realm.objectForPrimaryKey(Playlist, summary.playlist_id);
    if (playlist) {
      if (playlist.ownerUserId !== ownerUserId) continue;
      playlist.summaryRevision = Math.max(playlist.summaryRevision ?? 0, summary.revision);
      // Archive is online-only, so the server's flag is always current.
      if (playlist.archived !== summary.archived) playlist.archived = summary.archived;
      continue;
    }
    const updatedAt = new Date(summary.updated_at);
    realm.create(Playlist, {
      playlistId: summary.playlist_id,
      name: summary.name,
      entryCount: summary.entry_count,
      createdAt: updatedAt,
      updatedAt,
      ownerUserId,
      archived: summary.archived,
      serverState: 'synced',
      summaryRevision: summary.revision,
    });
  }
}

/** Replaces the canonical state with a snapshot, then prunes and rebuilds. */
export function applySnapshot(
  realm: Realm,
  playlist: Playlist,
  snapshot: PlaylistSnapshotResponse
) {
  const playlistId = playlist.playlistId;
  for (const row of realm.objects(PlaylistSegment).filtered('playlistId == $0', playlistId)) {
    row.canonicalLive = false;
  }
  for (const row of realm.objects(PlaylistEntry).filtered('playlistId == $0', playlistId)) {
    row.canonicalLive = false;
  }
  for (const segment of snapshot.segments) {
    upsertCanonicalSegment(realm, playlistId, segment.segment_id, segment.rank);
    for (const entry of segment.entries) {
      upsertCanonicalEntry(
        realm,
        playlistId,
        entry.entry_id,
        segment.segment_id,
        entry.track_id,
        entry.rank
      );
    }
  }

  playlist.canonicalName = snapshot.metadata.name;
  playlist.canonicalDescription = snapshot.metadata.description ?? undefined;
  playlist.archived = snapshot.archived;
  playlist.serverState = 'synced';
  playlist.appliedRevision = snapshot.revision;
  playlist.summaryRevision = Math.max(playlist.summaryRevision ?? 0, snapshot.revision);
  playlist.historyGeneration = snapshot.history_generation;
  playlist.updatedAt = new Date(snapshot.updated_at);

  pruneConfirmed(realm, playlist);
  rebuildDisplayed(realm, playlistId);
}

/** Applies one changes page, in array order, then prunes and rebuilds. */
export function applyChangesPage(realm: Realm, playlist: Playlist, page: PlaylistChangesResponse) {
  const playlistId = playlist.playlistId;
  for (const revision of page.revisions) {
    for (const change of revision.changes) {
      switch (change.type) {
        case 'metadata_updated':
          playlist.canonicalName = change.name;
          playlist.canonicalDescription = change.description ?? undefined;
          break;
        case 'segment_upserted':
          upsertCanonicalSegment(realm, playlistId, change.segment_id, change.rank);
          break;
        case 'segment_deleted': {
          const segment = realm.objectForPrimaryKey(PlaylistSegment, change.segment_id);
          if (segment) segment.canonicalLive = false;
          for (const entry of realm
            .objects(PlaylistEntry)
            .filtered('canonicalSegmentId == $0 AND canonicalLive == true', change.segment_id)) {
            entry.canonicalLive = false;
          }
          break;
        }
        case 'entry_upserted':
          upsertCanonicalEntry(
            realm,
            playlistId,
            change.entry_id,
            change.segment_id,
            change.track_id,
            change.rank
          );
          break;
        case 'entry_deleted': {
          const entry = realm.objectForPrimaryKey(PlaylistEntry, change.entry_id);
          if (entry) entry.canonicalLive = false;
          break;
        }
      }
    }
  }

  playlist.appliedRevision = page.next_after_revision;
  playlist.summaryRevision = Math.max(playlist.summaryRevision ?? 0, page.head_revision);
  playlist.historyGeneration = page.history_generation;
  if (page.revisions.length > 0) playlist.updatedAt = new Date();

  pruneConfirmed(realm, playlist);
  rebuildDisplayed(realm, playlistId);
}

/**
 * New rows start displayed exactly as confirmed; the rebuild that follows
 * places them correctly relative to any pending edits.
 */
function upsertCanonicalSegment(realm: Realm, playlistId: string, segmentId: string, rank: string) {
  const row =
    realm.objectForPrimaryKey(PlaylistSegment, segmentId) ??
    realm.create(PlaylistSegment, { segmentId, playlistId, rank, live: true });
  row.canonicalRank = rank;
  row.canonicalLive = true;
}

function upsertCanonicalEntry(
  realm: Realm,
  playlistId: string,
  entryId: string,
  segmentId: string,
  trackId: string,
  rank: string
) {
  const row =
    realm.objectForPrimaryKey(PlaylistEntry, entryId) ??
    realm.create(PlaylistEntry, { entryId, playlistId, segmentId, trackId, rank, live: true });
  row.canonicalSegmentId = segmentId;
  row.canonicalRank = rank;
  row.canonicalLive = true;
}

/**
 * Retires acknowledged operations whose result is now in the canonical state:
 * same history generation, and a result revision the pull has reached.
 */
export function pruneConfirmed(realm: Realm, playlist: Playlist) {
  const applied = playlist.appliedRevision ?? -1;
  const confirmed = realm
    .objects(PlaylistOperation)
    .filtered(
      'playlistId == $0 AND state == $1 AND resultGeneration == $2 AND resultRevision <= $3',
      playlist.playlistId,
      'acknowledged',
      playlist.historyGeneration ?? '',
      applied
    );
  realm.delete(confirmed);
}

/**
 * The server's history changed under us (a database restore). Forget every
 * base so playlists are fetched fresh, and send every edit still held again
 * with its original ID: a surviving receipt replays, anything else applies.
 */
export function startRestoreRecovery(realm: Realm, ownerUserId: string) {
  for (const playlist of realm.objects(Playlist).filtered('ownerUserId == $0', ownerUserId)) {
    playlist.appliedRevision = undefined;
    playlist.historyGeneration = undefined;
  }
  for (const op of realm
    .objects(PlaylistOperation)
    .filtered('ownerUserId == $0 AND state IN $1', ownerUserId, ['acknowledged', 'in_flight'])) {
    op.state = 'pending';
    op.resultRevision = undefined;
    op.resultGeneration = undefined;
  }
}

// endregion

function liveRows(
  realm: Realm,
  type: typeof PlaylistSegment,
  playlistId: string
): PlaylistSegment[];
function liveRows(realm: Realm, type: typeof PlaylistEntry, playlistId: string): PlaylistEntry[];
function liveRows(
  realm: Realm,
  type: typeof PlaylistSegment | typeof PlaylistEntry,
  playlistId: string
): (PlaylistSegment | PlaylistEntry)[] {
  return [
    ...realm
      .objects<PlaylistSegment | PlaylistEntry>(type.schema.name)
      .filtered('playlistId == $0 AND live == true', playlistId),
  ];
}

const segmentState = (s: PlaylistSegment): SegmentState => ({
  segmentId: s.segmentId,
  rank: s.rank,
});
const entryState = (e: PlaylistEntry): EntryState => ({
  entryId: e.entryId,
  segmentId: e.segmentId,
  trackId: e.trackId,
  rank: e.rank,
});
