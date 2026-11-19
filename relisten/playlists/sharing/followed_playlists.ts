import Realm from 'realm';
import {
  Playlist,
  PlaylistEntry,
  PlaylistSegment,
} from '@/relisten/realm/models/playlists/playlist';
import { writeEntryRow, writeSegmentRow } from '@/relisten/playlists/guide/guide_rows';
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
 * `access = 'follower'`, and keeps the real owner in `ownerUserId`. Two cases
 * store nothing: following your own public playlist keeps the row you made,
 * and a playlist ID already stored for another account on this device is
 * left to that account. The follow still exists on the server, so it appears
 * here once the other account's row is gone and a library snapshot arrives.
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
export function followsNeedingSnapshot(realm: Realm, userId: string, limit: number): Playlist[] {
  return [...followedPlaylists(realm, userId).sorted('updatedAt')]
    .filter(followNeedsSnapshot)
    .slice(0, limit);
}

/** Replaces a followed playlist's rows and details with its public snapshot. */
export function writeFollowedSnapshot(
  realm: Realm,
  playlist: Playlist,
  snapshot: PublicPlaylistSnapshot
) {
  const playlistId = playlist.playlistId;
  realm.delete(realm.objects(PlaylistEntry).filtered('playlistId == $0', playlistId));
  realm.delete(realm.objects(PlaylistSegment).filtered('playlistId == $0', playlistId));

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
  if (playlist.appliedRevision !== snapshot.revision) {
    playlist.updatedAt = new Date();
  }
  playlist.name = snapshot.metadata.name;
  playlist.description = snapshot.metadata.description ?? undefined;
  playlist.entryCount = publicTrackCount(snapshot);
  playlist.ownerUserId = snapshot.owner.id;
  playlist.ownerUsername = snapshot.owner.username;
  playlist.publicCode = snapshot.public_code;
  playlist.unavailable = false;
  playlist.appliedRevision = snapshot.revision;
  playlist.summaryRevision = snapshot.revision;
  playlist.historyGeneration = snapshot.history_generation;
}

/** Marks a followed playlist unavailable after its public snapshot answered 404. */
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
  // Your own playlist, an existing follow, or another account's row: keep it as it is.
  if (realm.objectForPrimaryKey(Playlist, playlistId)) {
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
  realm.delete(realm.objects(PlaylistEntry).filtered('playlistId == $0', playlistId));
  realm.delete(realm.objects(PlaylistSegment).filtered('playlistId == $0', playlistId));
  realm.delete(playlist);
}

/** Writes only a changed value, so a feed page that changed nothing wakes no listeners. */
function setIfChanged<K extends keyof Playlist>(playlist: Playlist, key: K, value: Playlist[K]) {
  if ((playlist[key] ?? undefined) !== (value ?? undefined)) {
    playlist[key] = value;
  }
}
