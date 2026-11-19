import Realm from 'realm';
import { FavoriteSyncState } from '@/relisten/realm/models/library/favorite_sync_state';
import {
  Playlist,
  PlaylistCommand,
  PlaylistCopyCommand,
  PLAYLIST_DEVICE_STATE_ID,
  PlaylistDeviceState,
  PlaylistEntry,
  PlaylistOperation,
  type PlaylistOperationState,
  PlaylistSegment,
} from '@/relisten/realm/models/playlists/playlist';
import {
  applyChanges,
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
  PlaylistPublicationState,
  PlaylistSnapshotResponse,
  PlaylistSummary,
} from '@/relisten/playlists/sync/playlist_wire';
import { createUuidV7TypedId } from '@/relisten/util/typed_uuid_id';
import {
  entryStateOf,
  segmentStateOf,
  trackCount,
  writeDescription,
  writeEntryRow,
  writeSegmentRow,
} from '@/relisten/playlists/guide/guide_rows';
import { wireEntries } from '@/relisten/playlists/sync/playlist_wire';

/**
 * Durable sync state for account playlists. Every function here runs inside a
 * Realm write owned by its caller.
 *
 * Each row keeps two states. The canonical fields hold what the server last
 * confirmed. The displayed fields (`segmentId`, `rank`, `live`, a segment's or
 * entry's `description`, and the playlist's `name` and `description`) hold
 * the canonical state with the owner's unconfirmed operations replayed on top,
 * in order. A listener's edit
 * changes the displayed fields directly and appends an operation; a pull
 * changes the canonical fields and rebuilds the displayed ones.
 */

/**
 * Operations still in the overlay: replayed over the canonical state on every
 * rebuild. A refused (`needs_attention`) edit is left out, so it disappears
 * from the playlist; its stored operation is what Add Again restores from.
 */
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
export function visibleLibraryUserId(realm: Realm): string | undefined {
  return (
    realm.objectForPrimaryKey(PlaylistDeviceState, PLAYLIST_DEVICE_STATE_ID)?.lastSignedInUserId ??
    undefined
  );
}

/**
 * Whether the current listener may see or play a playlist: one in their
 * library (or the last signed-in account's, while signed out), or one not
 * saved to any account. Lists, by-ID screens, edits, and CarPlay share it.
 */
export function canAccessPlaylist(realm: Realm, playlist: Playlist): boolean {
  return !playlist.libraryUserId || playlist.libraryUserId === visibleLibraryUserId(realm);
}

/** Whether the current listener may change a playlist: one they can see and made. */
export function canEditPlaylist(realm: Realm, playlist: Playlist): boolean {
  return playlist.access === 'owner' && canAccessPlaylist(realm, playlist);
}

/**
 * Signing in as `userId` makes it the visible owner and saves every unowned
 * playlist to that account, keeping its IDs. Nothing is copied, so a retried
 * create can never make a duplicate. Deleted device playlists stay unowned and
 * are purged on schedule. Returns how many playlists were claimed.
 */
export function claimDevicePlaylists(realm: Realm, userId: string): number {
  deviceState(realm).lastSignedInUserId = userId;

  const unowned = [
    ...realm.objects(Playlist).filtered('libraryUserId == null AND deletedAt == null'),
  ];
  for (const playlist of unowned) {
    playlist.ownerUserId = userId;
    playlist.libraryUserId = userId;
    issueCreateCommand(realm, playlist);
  }
  return unowned.length;
}

/**
 * The account was deleted: removes its library from the device, the
 * playlists it made and the ones it followed, along with their rows and
 * unsent work. Call this only after the server accepted the deletion. When
 * deletion can't be confirmed, use `hideAccountPlaylists`.
 */
export function forgetAccountPlaylists(realm: Realm, userId: string) {
  const playlists = realm.objects(Playlist).filtered('libraryUserId == $0', userId);
  const playlistIds = playlists.map((playlist) => playlist.playlistId);

  deletePlaylistRows(realm, playlistIds);
  realm.delete(realm.objects(PlaylistOperation).filtered('libraryUserId == $0', userId));
  realm.delete(realm.objects(PlaylistCommand).filtered('libraryUserId == $0', userId));
  realm.delete(realm.objects(PlaylistCopyCommand).filtered('userId == $0', userId));
  realm.delete(playlists);

  // Nothing of the deleted account remains on the device, so it stops being
  // the visible owner too.
  hideAccountPlaylists(realm, userId);
}

/**
 * Deletes the entries and segments of the given playlists. The Playlist rows
 * and any outbox are the caller's to keep or remove.
 */
export function deletePlaylistRows(realm: Realm, playlistIds: string[]) {
  realm.delete(realm.objects(PlaylistEntry).filtered('playlistId IN $0', playlistIds));
  realm.delete(realm.objects(PlaylistSegment).filtered('playlistId IN $0', playlistIds));
}

/** Every stored segment and entry of a playlist, hidden ones included. */
export function playlistRows(realm: Realm, playlistId: string) {
  return {
    segments: [...realm.objects(PlaylistSegment).filtered('playlistId == $0', playlistId)],
    entries: [...realm.objects(PlaylistEntry).filtered('playlistId == $0', playlistId)],
  };
}

/**
 * Writes a field only when its value differs. Realm reports every assignment
 * as a change, so an equal value would still wake the row's listeners and
 * re-render the screens subscribed to it. An unset optional field reads as
 * null, which counts as equal to undefined.
 */
export function setIfChanged<
  Row extends Playlist | PlaylistSegment | PlaylistEntry,
  Key extends keyof Row,
>(row: Row, key: Key, value: Row[Key]) {
  if ((row[key] ?? undefined) !== (value ?? undefined)) {
    row[key] = value;
  }
}

/**
 * Removes a followed playlist from the device so `userId`, the signed-in
 * account, can store this playlist ID instead. There is one row per playlist
 * ID, and a followed row has no outbox, so nothing unsent is lost. Another
 * account's follow stays on the server: dropping that account's library
 * cursor makes its next pull a snapshot, which lists the follow again.
 */
export function releaseFollowedRow(realm: Realm, playlist: Playlist, userId: string) {
  if (playlist.libraryUserId && playlist.libraryUserId !== userId) {
    requestLibrarySnapshot(realm, playlist.libraryUserId);
  }
  deletePlaylistRows(realm, [playlist.playlistId]);
  realm.delete(playlist);
}

/** Drops the account's library feed cursor, so its next pull is a whole snapshot. */
function requestLibrarySnapshot(realm: Realm, userId: string) {
  for (const syncState of realm.objects(FavoriteSyncState).filtered('scopeId == $0', userId)) {
    syncState.libraryCursor = undefined;
  }
}

/**
 * Hides the account's playlists, keeping them and their pending edits on the
 * device. Ordinary sign-out keeps the last account visible on purpose. This is
 * for a session that ended during deletion, when the account may be gone.
 * Signing in to it again shows them again.
 */
export function hideAccountPlaylists(realm: Realm, userId: string) {
  const state = deviceState(realm);
  if (state.lastSignedInUserId === userId) {
    state.lastSignedInUserId = undefined;
  }
}

/**
 * Freezes what the device shows into a create command, and makes that the
 * provisional canonical state until the server confirms it, so edits made
 * meanwhile replay on top of exactly what the command will create.
 *
 * Used when a playlist first gets an owner, and to recreate one the account
 * lost (a restore older than the playlist). In the second case any earlier
 * confirmed state is stale: hidden rows are dropped and the caller has already
 * removed the overlay, whose effects are part of what the device shows.
 */
export function issueCreateCommand(realm: Realm, playlist: Playlist) {
  const playlistId = playlist.playlistId;
  realm.delete(
    realm.objects(PlaylistSegment).filtered('playlistId == $0 AND live == false', playlistId)
  );
  realm.delete(
    realm.objects(PlaylistEntry).filtered('playlistId == $0 AND live == false', playlistId)
  );
  const segments = liveRows(realm, PlaylistSegment, playlistId);
  const entries = liveRows(realm, PlaylistEntry, playlistId);

  playlist.serverState = 'creating';
  markNeedsSnapshot(playlist);
  playlist.canonicalName = playlist.name;
  playlist.canonicalDescription = playlist.description;
  for (const segment of segments) {
    segment.canonicalRank = segment.rank;
    segment.canonicalLive = true;
    segment.canonicalDescription = segment.description;
  }
  for (const entry of entries) {
    entry.canonicalSegmentId = entry.segmentId;
    entry.canonicalRank = entry.rank;
    entry.canonicalLive = true;
    entry.canonicalDescription = entry.description;
  }

  const groups = orderedGroups({
    segments: new Map(segments.map((s) => [s.segmentId, segmentStateOf(s)])),
    entries: new Map(entries.map((e) => [e.entryId, entryStateOf(e)])),
  });
  const commandId = createUuidV7TypedId('command');
  const request: CreatePlaylistRequest = {
    contract_version: 1,
    command_id: commandId,
    playlist_id: playlist.playlistId,
    metadata: { name: playlist.name, description: playlist.description ?? null },
    segments: groups.map((group) => ({
      segment_id: group.segment.segmentId,
      description: group.segment.description,
      entries: wireEntries(group.entries),
    })),
  };

  realm.create(PlaylistCommand, {
    commandId,
    playlistId: playlist.playlistId,
    libraryUserId: playlist.libraryUserId!,
    requestJson: JSON.stringify(request),
    state: 'pending',
    createdAt: new Date(),
  });
}

/**
 * A playlist with no confirmed revision is fetched whole by snapshot on the
 * next pull: one new to this device, one just created, or any after a restore.
 */
export function markNeedsSnapshot(playlist: Playlist) {
  // Revisions from another history generation don't compare, so all three go together.
  playlist.appliedRevision = undefined;
  playlist.summaryRevision = undefined;
  playlist.historyGeneration = undefined;
}

export function needsSnapshot(playlist: Playlist): boolean {
  return playlist.appliedRevision == null;
}

// endregion

// region Outbox state transitions

/**
 * Requests that were in flight when the app stopped never got a response;
 * they are resent with the same IDs and the server replays any that landed.
 * Runs at the start of each sync run, when nothing is in flight.
 */
export function resetInterruptedOperations(realm: Realm, libraryUserId: string) {
  for (const op of realm
    .objects(PlaylistOperation)
    .filtered('libraryUserId == $0 AND state == $1', libraryUserId, 'in_flight')) {
    op.state = 'pending';
  }
}

/** Edits held while the playlist was archived are sent once it is restored, from any device. */
export function releaseHeldEdits(realm: Realm, playlistId: string) {
  for (const op of realm
    .objects(PlaylistOperation)
    .filtered('playlistId == $0 AND state == $1', playlistId, 'archived_hold')) {
    op.state = 'pending';
  }
}

/**
 * A deletion synced, so the account may have room again: resend paused
 * outboxes whole and retry creates that the account refused as full.
 */
export function resumeAfterDeletion(realm: Realm, libraryUserId: string) {
  for (const op of realm
    .objects(PlaylistOperation)
    .filtered('libraryUserId == $0 AND state == $1', libraryUserId, 'quota_paused')) {
    op.state = 'pending';
  }
  for (const command of realm
    .objects(PlaylistCommand)
    .filtered(
      'libraryUserId == $0 AND state == $1 AND lastErrorCode == $2',
      libraryUserId,
      'needs_attention',
      'quota_exceeded'
    )) {
    command.state = 'pending';
    const playlist = realm.objectForPrimaryKey(Playlist, command.playlistId);
    if (playlist) {
      playlist.serverState = 'creating';
    }
  }
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
    libraryUserId: playlist.libraryUserId!,
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
 * Records one listener edit that changed something: writes its changes to the
 * displayed fields and, for an account playlist, appends it to the outbox.
 * Returns the outbox operation ID, if any. The repository's edits all come
 * through here, so it never handles outbox rows itself.
 */
export function recordEdit(
  realm: Realm,
  playlist: Playlist,
  edit: PlaylistEdit,
  changes?: PlaylistChanges
): string | undefined {
  if (changes) {
    writeDisplayedChanges(realm, playlist, changes);
  }
  return playlist.libraryUserId ? appendOperation(realm, playlist, edit) : undefined;
}

/**
 * How deleting an owned playlist works. The server never accepted one whose
 * create was never sent or was refused, so it is removed on the device like a
 * device playlist. One whose create was sent without an answer yet can't be
 * deleted until that answer arrives. Everything else is archived on the account.
 */
export function ownedDeletion(realm: Realm, playlist: Playlist): 'local' | 'pending' | 'archive' {
  const commands = realm.objects(PlaylistCommand).filtered('playlistId == $0', playlist.playlistId);
  if (playlist.serverState === 'needs_attention' || playlist.serverState == null) {
    return 'local';
  }
  if (playlist.serverState === 'creating') {
    return commands.some((c) => c.attemptCount > 0) ? 'pending' : 'local';
  }
  return 'archive';
}

/**
 * Moves a never-created account playlist to Recently Deleted on the device and
 * drops its unsent work. It keeps its owner; restoring it issues a fresh create.
 */
export function deleteNeverCreated(realm: Realm, playlist: Playlist) {
  realm.delete(realm.objects(PlaylistCommand).filtered('playlistId == $0', playlist.playlistId));
  realm.delete(realm.objects(PlaylistOperation).filtered('playlistId == $0', playlist.playlistId));
  playlist.serverState = undefined;
  playlist.deletedAt = new Date();
}

/**
 * Restores a playlist from the device's Recently Deleted. Signed in, it belongs
 * to the current account and is saved there (a fresh create); signed out, a
 * device playlist stays unowned and is saved when someone next signs in.
 */
export function restoreDeletedOnDevice(
  realm: Realm,
  playlist: Playlist,
  signedInUserId: string | undefined
) {
  playlist.deletedAt = undefined;
  const owner = playlist.libraryUserId ?? signedInUserId;
  if (owner) {
    playlist.ownerUserId = owner;
    playlist.libraryUserId = owner;
    issueCreateCommand(realm, playlist);
  }
}

/**
 * Removes an account playlist before the account has it, to undo creating it.
 * Returns false once its create may have been sent.
 */
export function discardUnsentPlaylist(realm: Realm, playlist: Playlist): boolean {
  const commands = realm.objects(PlaylistCommand).filtered('playlistId == $0', playlist.playlistId);
  if (playlist.serverState !== 'creating' || commands.some((c) => c.attemptCount > 0)) {
    return false;
  }
  realm.delete(commands);
  realm.delete(realm.objects(PlaylistOperation).filtered('playlistId == $0', playlist.playlistId));
  return true;
}

/**
 * Writes an applied operation's changes to the displayed fields. In an account
 * playlist a row the server still has is hidden rather than deleted, because
 * its canonical fields are still needed.
 */
function writeDisplayedChanges(realm: Realm, playlist: Playlist, changes: PlaylistChanges) {
  const playlistId = playlist.playlistId;
  for (const segment of changes.upsertSegments) {
    writeSegmentRow(realm, playlistId, segment);
  }
  for (const entry of changes.upsertEntries) {
    writeEntryRow(realm, playlistId, entry);
  }
  for (const entryId of changes.deleteEntryIds) {
    hideOrDelete(realm, realm.objectForPrimaryKey(PlaylistEntry, entryId));
  }
  for (const segmentId of changes.deleteSegmentIds) {
    hideOrDelete(realm, realm.objectForPrimaryKey(PlaylistSegment, segmentId));
  }
}

function hideOrDelete(realm: Realm, row: PlaylistEntry | PlaylistSegment | null) {
  if (!row) {
    return;
  }
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
  if (!playlist) {
    return;
  }

  const { segments: segmentRows, entries: entryRows } = playlistRows(realm, playlistId);
  const state = readCanonical(playlist, segmentRows, entryRows);
  replayOverlay(state, overlayEdits(realm, playlistId));

  writeRebuilt(
    realm,
    segmentRows,
    state.segments,
    (row) => row.segmentId,
    (row, segment) => {
      if (row.rank !== segment.rank) {
        row.rank = segment.rank;
      }
      writeDescription(realm, row, segment.description);
    },
    (segment) => writeSegmentRow(realm, playlistId, segment)
  );
  writeRebuilt(
    realm,
    entryRows,
    state.entries,
    (row) => row.entryId,
    (row, entry) => {
      if (row.rank !== entry.rank) {
        row.rank = entry.rank;
      }
      if (row.segmentId !== entry.segmentId) {
        row.segmentId = entry.segmentId;
      }
      writeDescription(realm, row, entry.description);
    },
    (entry) => writeEntryRow(realm, playlistId, entry)
  );

  if (playlist.name !== state.name) {
    playlist.name = state.name;
  }
  if ((playlist.description ?? undefined) !== (state.description ?? undefined)) {
    playlist.description = state.description;
  }
  const tracks = trackCount(state);
  if (playlist.entryCount !== tracks) {
    playlist.entryCount = tracks;
  }
}

interface WorkingState {
  segments: Map<string, SegmentState>;
  entries: Map<string, EntryState>;
  name: string;
  description?: string;
}

function readCanonical(
  playlist: Playlist,
  segmentRows: PlaylistSegment[],
  entryRows: PlaylistEntry[]
): WorkingState {
  const segments = new Map<string, SegmentState>();
  const entries = new Map<string, EntryState>();
  for (const row of segmentRows) {
    if (row.canonicalLive) {
      const segment: SegmentState = { segmentId: row.segmentId, rank: row.canonicalRank! };
      if (row.canonicalDescription) {
        segment.description = row.canonicalDescription;
      }
      segments.set(row.segmentId, segment);
    }
  }
  for (const row of entryRows) {
    if (row.canonicalLive) {
      const entry: EntryState = {
        entryId: row.entryId,
        segmentId: row.canonicalSegmentId!,
        rank: row.canonicalRank!,
      };
      if (row.trackId) {
        entry.trackId = row.trackId;
      }
      if (row.canonicalDescription) {
        entry.description = row.canonicalDescription;
      }
      entries.set(row.entryId, entry);
    }
  }
  return {
    segments,
    entries,
    name: playlist.canonicalName ?? playlist.name,
    description: playlist.canonicalDescription,
  };
}

/** Applies the overlay to the working state in order, with the same engine edits use. */
function replayOverlay(state: WorkingState, edits: PlaylistEdit[]) {
  for (const edit of edits) {
    if (edit.type === 'update_metadata') {
      Object.assign(state, applyMetadata(state, edit));
      continue;
    }
    applyChanges(state, applyPlaylistOperation(state, edit).changes);
  }
}

function writeRebuilt<Row extends PlaylistSegment | PlaylistEntry, State>(
  realm: Realm,
  rows: Row[],
  states: Map<string, State>,
  idOf: (row: Row) => string,
  update: (row: Row, state: State) => void,
  create: (state: State) => void
) {
  const seen = new Set<string>();
  for (const row of rows) {
    const id = idOf(row);
    const state = states.get(id);
    seen.add(id);
    if (state) {
      if (!row.live) {
        row.live = true;
      }
      update(row, state);
    } else if (row.canonicalLive) {
      if (row.live) {
        row.live = false;
      }
    } else {
      // Neither confirmed nor in the overlay: an edit that was withdrawn or refused.
      realm.delete(row);
    }
  }
  // Rows always exist for overlay items, since edits write them; this covers
  // an overlay replayed after its rows were lost to a restore.
  for (const [id, state] of states) {
    if (seen.has(id)) {
      continue;
    }
    create(state);
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
 *
 * A summary says the account owns the playlist. A followed row with the same
 * ID gives way to it, whether another account on this device follows the
 * playlist or the owner followed it from a link before this summary arrived.
 * A row another account owns is kept, because it may hold unsent edits; the
 * summary is then skipped and the playlist is missing from this library.
 */
export function applyPlaylistSummaries(realm: Realm, userId: string, summaries: PlaylistSummary[]) {
  for (const summary of summaries) {
    const playlist = realm.objectForPrimaryKey(Playlist, summary.playlist_id);
    if (playlist?.access === 'follower') {
      releaseFollowedRow(realm, playlist, userId);
    } else if (playlist) {
      if (playlist.libraryUserId !== userId) {
        continue;
      }
      playlist.summaryRevision = Math.max(playlist.summaryRevision ?? 0, summary.revision);
      // Archive and publication are online-only, so the server's flags are current.
      setArchived(realm, playlist, summary.archived);
      recordPublication(playlist, summary);
      continue;
    }
    const updatedAt = new Date(summary.updated_at);
    realm.create(Playlist, {
      playlistId: summary.playlist_id,
      name: summary.name,
      entryCount: summary.track_count ?? summary.entry_count,
      createdAt: updatedAt,
      updatedAt,
      ownerUserId: userId,
      libraryUserId: userId,
      archived: summary.archived,
      serverState: 'synced',
      summaryRevision: summary.revision,
      publicCode: summary.public_code ?? undefined,
      published: summary.published ?? false,
      takenDown: summary.taken_down ?? false,
    });
  }
}

/** Records the server's sharing state for an owned playlist, writing only what changed. */
export function recordPublication(playlist: Playlist, publication: PlaylistPublicationState) {
  setIfChanged(playlist, 'publicCode', publication.public_code ?? undefined);
  setIfChanged(playlist, 'published', publication.published ?? false);
  setIfChanged(playlist, 'takenDown', publication.taken_down ?? false);
}

/** Replaces the canonical state with a snapshot, then prunes and rebuilds. */
export function applySnapshot(
  realm: Realm,
  playlist: Playlist,
  snapshot: PlaylistSnapshotResponse
) {
  const playlistId = playlist.playlistId;
  const segmentIds = new Set<string>();
  const entryIds = new Set<string>();

  for (const segment of snapshot.segments) {
    segmentIds.add(segment.segment_id);
    upsertCanonicalSegment(realm, playlistId, {
      segmentId: segment.segment_id,
      rank: segment.rank,
      description: segment.description ?? undefined,
    });
    for (const entry of segment.entries) {
      entryIds.add(entry.entry_id);
      upsertCanonicalEntry(realm, playlistId, {
        entryId: entry.entry_id,
        segmentId: segment.segment_id,
        trackId: entry.track_id ?? undefined,
        rank: entry.rank,
        description: entry.description ?? undefined,
      });
    }
  }

  // The snapshot is the whole confirmed state: a row it leaves out is no
  // longer confirmed. The rebuild below hides or deletes it.
  const rows = playlistRows(realm, playlistId);
  for (const row of rows.segments) {
    if (!segmentIds.has(row.segmentId)) {
      setIfChanged(row, 'canonicalLive', false);
    }
  }
  for (const row of rows.entries) {
    if (!entryIds.has(row.entryId)) {
      setIfChanged(row, 'canonicalLive', false);
    }
  }

  setIfChanged(playlist, 'canonicalName', snapshot.metadata.name);
  setIfChanged(playlist, 'canonicalDescription', snapshot.metadata.description ?? undefined);
  setArchived(realm, playlist, snapshot.archived);
  recordPublication(playlist, snapshot);
  playlist.serverState = 'synced';
  playlist.appliedRevision = snapshot.revision;
  playlist.summaryRevision = Math.max(playlist.summaryRevision ?? 0, snapshot.revision);
  playlist.historyGeneration = snapshot.history_generation;
  playlist.updatedAt = new Date(snapshot.updated_at);

  pruneConfirmed(realm, playlist);
  rebuildDisplayed(realm, playlistId);
}

/** Records the server's archive flag; a restore from any device releases held edits. */
export function setArchived(realm: Realm, playlist: Playlist, archived: boolean) {
  if (playlist.archived !== archived) {
    playlist.archived = archived;
  }
  if (!archived) {
    releaseHeldEdits(realm, playlist.playlistId);
  }
}

/** Applies one changes page, in array order, then prunes and rebuilds. */
export function applyChangesPage(realm: Realm, playlist: Playlist, page: PlaylistChangesResponse) {
  const playlistId = playlist.playlistId;
  // An empty page that confirms what is already applied writes nothing, so it
  // can't wake the listeners that schedule the next pull.
  if (
    page.revisions.length === 0 &&
    playlist.appliedRevision === page.next_after_revision &&
    playlist.historyGeneration === page.history_generation &&
    (playlist.summaryRevision ?? 0) >= page.head_revision
  ) {
    return;
  }
  for (const revision of page.revisions) {
    for (const change of revision.changes) {
      switch (change.type) {
        case 'metadata_updated':
          setIfChanged(playlist, 'canonicalName', change.name);
          setIfChanged(playlist, 'canonicalDescription', change.description ?? undefined);
          break;
        case 'segment_upserted':
          upsertCanonicalSegment(realm, playlistId, {
            segmentId: change.segment_id,
            rank: change.rank,
            description: change.description ?? undefined,
          });
          break;
        case 'segment_deleted': {
          const segment = realm.objectForPrimaryKey(PlaylistSegment, change.segment_id);
          if (segment) {
            segment.canonicalLive = false;
          }
          for (const entry of realm
            .objects(PlaylistEntry)
            .filtered(
              'playlistId == $0 AND canonicalSegmentId == $1 AND canonicalLive == true',
              playlistId,
              change.segment_id
            )) {
            entry.canonicalLive = false;
          }
          break;
        }
        case 'entry_upserted':
          upsertCanonicalEntry(realm, playlistId, {
            entryId: change.entry_id,
            segmentId: change.segment_id,
            trackId: change.track_id ?? undefined,
            rank: change.rank,
            description: change.description ?? undefined,
          });
          break;
        case 'entry_deleted': {
          const entry = realm.objectForPrimaryKey(PlaylistEntry, change.entry_id);
          if (entry) {
            entry.canonicalLive = false;
          }
          break;
        }
      }
    }
  }

  // A deletion from another device may have freed space in a full account, so
  // work paused for quota gets another try, as after this device's own deletions.
  const deleted = page.revisions.some((revision) =>
    revision.changes.some(
      (change) => change.type === 'entry_deleted' || change.type === 'segment_deleted'
    )
  );
  if (deleted && playlist.libraryUserId) {
    resumeAfterDeletion(realm, playlist.libraryUserId);
  }

  playlist.appliedRevision = page.next_after_revision;
  playlist.summaryRevision = Math.max(playlist.summaryRevision ?? 0, page.head_revision);
  playlist.historyGeneration = page.history_generation;
  if (page.revisions.length > 0) {
    playlist.updatedAt = new Date();
  }

  pruneConfirmed(realm, playlist);
  rebuildDisplayed(realm, playlistId);
}

/**
 * Records a segment's confirmed state. A new row starts at the confirmed rank;
 * the rebuild that follows sets every displayed field, including the
 * description, relative to any pending edits.
 */
function upsertCanonicalSegment(realm: Realm, playlistId: string, segment: SegmentState) {
  const row =
    realm.objectForPrimaryKey(PlaylistSegment, segment.segmentId) ??
    realm.create(PlaylistSegment, {
      segmentId: segment.segmentId,
      playlistId,
      rank: segment.rank,
      live: true,
    });
  setIfChanged(row, 'canonicalRank', segment.rank);
  setIfChanged(row, 'canonicalLive', true);
  setIfChanged(row, 'canonicalDescription', segment.description);
}

/** Records an entry's confirmed state, like `upsertCanonicalSegment`. A text block has no track. */
function upsertCanonicalEntry(realm: Realm, playlistId: string, entry: EntryState) {
  const row =
    realm.objectForPrimaryKey(PlaylistEntry, entry.entryId) ??
    realm.create(PlaylistEntry, {
      entryId: entry.entryId,
      playlistId,
      segmentId: entry.segmentId,
      trackId: entry.trackId,
      rank: entry.rank,
      live: true,
    });
  setIfChanged(row, 'canonicalSegmentId', entry.segmentId);
  setIfChanged(row, 'canonicalRank', entry.rank);
  setIfChanged(row, 'canonicalLive', true);
  setIfChanged(row, 'canonicalDescription', entry.description);
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
 * The run that follows sends before it pulls, as the contract requires.
 *
 * Generations are compared per playlist (its last pull) and for the library
 * feed (`FavoriteSyncState`); whichever notices first starts this, and a
 * second start is harmless because every resend replays. When a playlist
 * notices first, the library feed keeps its old generation on purpose: the
 * snapshot that the dropped cursor forces then finds the new generation, and
 * the favorites applier (`resetIfRestored`) finishes resetting favorites.
 */
export function startRestoreRecovery(realm: Realm, libraryUserId: string) {
  // When a playlist response notices the restore first, the library feed's
  // cursor is from the old history too.
  requestLibrarySnapshot(realm, libraryUserId);
  // Followed playlists too: their stored revisions are from the old history.
  for (const playlist of realm.objects(Playlist).filtered('libraryUserId == $0', libraryUserId)) {
    markNeedsSnapshot(playlist);
  }
  for (const op of realm
    .objects(PlaylistOperation)
    .filtered('libraryUserId == $0 AND state IN $1', libraryUserId, [
      'acknowledged',
      'in_flight',
    ])) {
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
