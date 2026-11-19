import Realm from 'realm';
import { FavoriteSyncState } from '@/relisten/realm/models/library/favorite_sync_state';
import { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { writeEntryRow, writeSegmentRow } from '@/relisten/playlists/guide/guide_rows';
import {
  deletePlaylistRows,
  releaseFollowedRow,
} from '@/relisten/playlists/sync/playlist_sync_state';
import {
  type FollowedPlaylistHead,
  publicTrackCount,
  type PublicPlaylistSnapshot,
} from '@/relisten/playlists/sharing/sharing_wire';

/**
 * Followed playlists on this device. Every function here runs inside a Realm
 * write owned by its caller.
 *
 * Which playlists a listener follows comes only from the library feed:
 * `playlist_followed` and `playlist_unfollowed` changes, or a whole list on a
 * library snapshot. Heads in the feed update what is shown and the revision to
 * pull, but never add or remove a follow. The structure comes from the public
 * snapshot, which replaces the rows whole; a followed playlist has no
 * canonical state and no outbox.
 *
 * A followed row lives in the follower's library (`libraryUserId`) with
 * `access = 'follower'`, and keeps the real owner in `ownerUserId`.
 *
 * The device holds one row per playlist ID, whichever account it is for:
 * - Following your own playlist keeps the row you made. If the follow arrives
 *   first (from a link, before the library feed names the playlist), it is
 *   stored as followed until the owner's summary replaces it
 *   (`applyPlaylistSummaries`).
 * - A row another account on this device owns is left alone, because it may
 *   hold unsent edits. The follow still exists on the server, and appears
 *   here once that row is gone and a library snapshot arrives.
 * - A row another account follows is replaced by this account's follow. It
 *   has nothing unsent, and that account gets it back on its next pull.
 */

/** Applies the follow changes of one feed page, in order. */
export function applyFollowChanges(
  realm: Realm,
  userId: string,
  changes: { playlistId: string; followed: boolean }[]
) {
  for (const { playlistId, followed } of changes) {
    if (followed) {
      addFollow(realm, userId, playlistId);
    } else {
      removeFollow(realm, userId, playlistId);
    }
  }
}

/** A library snapshot lists every follow: anything else stored as followed is gone. */
export function replaceFollows(realm: Realm, userId: string, playlistIds: Iterable<string>) {
  const followed = new Set(playlistIds);
  for (const playlist of [...followedPlaylists(realm, userId)]) {
    if (!followed.has(playlist.playlistId)) {
      removeFollow(realm, userId, playlist.playlistId);
    }
  }
  for (const playlistId of followed) {
    addFollow(realm, userId, playlistId);
  }
}

/**
 * Records heads on the follows already stored. A head newer than the stored
 * snapshot sets `summaryRevision`, which the playlist sync pulls. An
 * unavailable head keeps the last name shown, marked unavailable.
 */
export function applyFollowedHeads(realm: Realm, userId: string, heads: FollowedPlaylistHead[]) {
  for (const head of heads) {
    const playlist = realm.objectForPrimaryKey(Playlist, head.playlist_id);
    if (!playlist || !isFollowedBy(playlist, userId)) {
      continue;
    }
    if (!head.available) {
      setIfChanged(playlist, 'unavailable', true);
      continue;
    }
    setIfChanged(playlist, 'unavailable', false);
    setIfChanged(playlist, 'name', head.name);
    setIfChanged(playlist, 'publicCode', head.public_code);
    setIfChanged(playlist, 'ownerUserId', head.owner.id);
    setIfChanged(playlist, 'ownerUsername', head.owner.username);
    setIfChanged(playlist, 'summaryRevision', head.revision);
  }
}

/**
 * Whether a followed playlist's stored copy is behind: its head names another
 * revision, or the copy is from an older history (`markNeedsSnapshot` after a
 * restore clears its revision).
 */
export function followNeedsSnapshot(playlist: Playlist): boolean {
  return (
    !playlist.unavailable &&
    !!playlist.publicCode &&
    (playlist.appliedRevision == null || playlist.appliedRevision !== playlist.summaryRevision)
  );
}

/** The followed playlists to pull, oldest copy first, so each sync makes progress on all of them. */
export function followsNeedingSnapshot(realm: Realm, userId: string): Playlist[] {
  return [...followedPlaylists(realm, userId).sorted('updatedAt')].filter(followNeedsSnapshot);
}

/**
 * Stores a fetched public snapshot as `userId`'s copy of a playlist they
 * follow. Returns whether the follow is settled; false means this snapshot
 * left it behind its head, so the caller should fetch again later.
 *
 * Public snapshots are cached at the edge for about a minute, so one can be
 * older than the head the library feed just delivered, older than the copy
 * already stored, or from the history before a restore. An older revision
 * never replaces a newer copy, and a snapshot from another history
 * generation than the library's is never stored: mixing generations would
 * compare revisions that don't relate.
 */
export function applyFollowedSnapshot(
  realm: Realm,
  userId: string,
  snapshot: PublicPlaylistSnapshot
): boolean {
  const playlist = realm.objectForPrimaryKey(Playlist, snapshot.playlist_id);
  if (!playlist || !isFollowedBy(playlist, userId)) {
    return true;
  }

  const libraryGeneration = realm
    .objects(FavoriteSyncState)
    .filtered('scopeId == $0', userId)[0]?.historyGeneration;
  // A mismatch is retried until the two agree: the library feed's next pull
  // records the new generation, or the edge's cached snapshot expires.
  if (libraryGeneration && libraryGeneration !== snapshot.history_generation) {
    return false;
  }

  // An older or equal snapshot is ignored; the check below then reports the
  // follow still behind its head, so it is fetched again.
  if (playlist.appliedRevision == null || snapshot.revision > playlist.appliedRevision) {
    writeFollowedSnapshot(realm, playlist, snapshot);
  }
  return !followNeedsSnapshot(playlist);
}

/**
 * Stores a follow the server just confirmed, from the snapshot the screen
 * already shows, so the followed copy is ready at once, offline included.
 * The order matters: heads only update rows that are already follows, and
 * the head's revision is what lets the snapshot settle the follow.
 */
export function storeConfirmedFollow(
  realm: Realm,
  userId: string,
  snapshot: PublicPlaylistSnapshot
) {
  applyFollowChanges(realm, userId, [{ playlistId: snapshot.playlist_id, followed: true }]);
  applyFollowedHeads(realm, userId, [
    {
      playlist_id: snapshot.playlist_id,
      available: true,
      public_code: snapshot.public_code,
      name: snapshot.metadata.name,
      owner: snapshot.owner,
      revision: snapshot.revision,
    },
  ]);
  applyFollowedSnapshot(realm, userId, snapshot);
}

/** Replaces a followed playlist's rows and details with a newer public snapshot. */
function writeFollowedSnapshot(realm: Realm, playlist: Playlist, snapshot: PublicPlaylistSnapshot) {
  const playlistId = playlist.playlistId;
  deletePlaylistRows(realm, [playlistId]);

  for (const segment of snapshot.segments) {
    writeSegmentRow(realm, playlistId, {
      segmentId: segment.segment_id,
      rank: segment.rank,
      description: segment.description ?? undefined,
    });
    for (const entry of segment.entries) {
      writeEntryRow(realm, playlistId, {
        entryId: entry.entry_id,
        segmentId: segment.segment_id,
        trackId: entry.track_id ?? undefined,
        rank: entry.rank,
        description: entry.description ?? undefined,
      });
    }
  }

  // A newer revision is an edit by the owner, which moves it up the list.
  playlist.updatedAt = new Date();
  playlist.name = snapshot.metadata.name;
  playlist.description = snapshot.metadata.description ?? undefined;
  playlist.entryCount = publicTrackCount(snapshot);
  playlist.ownerUserId = snapshot.owner.id;
  playlist.ownerUsername = snapshot.owner.username;
  playlist.publicCode = snapshot.public_code;
  playlist.unavailable = false;
  playlist.appliedRevision = snapshot.revision;
  // The head may already name a later revision than this snapshot; keeping it
  // leaves the follow needing another pull.
  playlist.summaryRevision = Math.max(playlist.summaryRevision ?? 0, snapshot.revision);
  playlist.historyGeneration = snapshot.history_generation;
}

/**
 * Marks a followed playlist unavailable after its public snapshot could not
 * be had. It is not fetched again until a head says it is available.
 */
export function markFollowUnavailable(playlist: Playlist) {
  setIfChanged(playlist, 'unavailable', true);
}

export function isFollowedBy(playlist: Playlist, userId: string) {
  return playlist.libraryUserId === userId && playlist.access === 'follower';
}

function followedPlaylists(realm: Realm, userId: string) {
  return realm
    .objects(Playlist)
    .filtered('libraryUserId == $0 AND access == $1', userId, 'follower');
}

/** Stores a follow with no details yet; the head on the same pull names it. */
function addFollow(realm: Realm, userId: string, playlistId: string) {
  const existing = realm.objectForPrimaryKey(Playlist, playlistId);
  if (existing?.access === 'follower' && existing.libraryUserId !== userId) {
    releaseFollowedRow(realm, existing, userId);
  } else if (existing) {
    // This account's own playlist or follow, or a playlist another account owns.
    return;
  }

  const now = new Date();
  realm.create(Playlist, {
    playlistId,
    name: '',
    createdAt: now,
    updatedAt: now,
    libraryUserId: userId,
    access: 'follower',
  });
}

function removeFollow(realm: Realm, userId: string, playlistId: string) {
  const playlist = realm.objectForPrimaryKey(Playlist, playlistId);
  if (!playlist || !isFollowedBy(playlist, userId)) {
    return;
  }
  deletePlaylistRows(realm, [playlistId]);
  realm.delete(playlist);
}

/** Writes only a changed value, so a feed page that changed nothing wakes no listeners. */
function setIfChanged<K extends keyof Playlist>(playlist: Playlist, key: K, value: Playlist[K]) {
  if ((playlist[key] ?? undefined) !== (value ?? undefined)) {
    playlist[key] = value;
  }
}
