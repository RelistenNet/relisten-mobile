import Realm from 'realm';
import {
  Playlist,
  PlaylistEntry,
  PlaylistSegment,
} from '@/relisten/realm/models/playlists/playlist';
import {
  applyPlaylistOperation,
  type EntryState,
  type OperationResult,
  type PlaylistOperation,
  type PlaylistSnapshot,
  type SegmentState,
} from '@/relisten/playlists/playlist_operations';
import { createUuidV7TypedId } from '@/relisten/util/typed_uuid_id';

/** Local playlists follow the server contract's limits so they can be saved to an account later. */
export const PLAYLIST_LIMITS = {
  nameLength: 100,
  descriptionLength: 1000,
  entriesPerPlaylist: 5000,
} as const;

export const RECENTLY_DELETED_DAYS = 30;

export const newPlaylistId = () => createUuidV7TypedId('playlist');
export const newSegmentId = () => createUuidV7TypedId('playlist_segment');
export const newEntryId = () => createUuidV7TypedId('playlist_entry');

export class PlaylistLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaylistLimitError';
  }
}

/** Trims and normalizes a name the same way the server will, so a later save never fails validation. */
export function normalizePlaylistName(name: string): string {
  return name.normalize('NFC').trim().slice(0, PLAYLIST_LIMITS.nameLength);
}

export function normalizePlaylistDescription(description: string | undefined): string | undefined {
  const value = description?.normalize('NFC').trim().slice(0, PLAYLIST_LIMITS.descriptionLength);
  return value ? value : undefined;
}

export function readPlaylistSnapshot(realm: Realm, playlistId: string): PlaylistSnapshot {
  const segments = new Map<string, SegmentState>();
  for (const s of realm.objects(PlaylistSegment).filtered('playlistId == $0', playlistId)) {
    segments.set(s.segmentId, { segmentId: s.segmentId, rank: s.rank });
  }

  const entries = new Map<string, EntryState>();
  for (const e of realm.objects(PlaylistEntry).filtered('playlistId == $0', playlistId)) {
    entries.set(e.entryId, {
      entryId: e.entryId,
      segmentId: e.segmentId,
      trackId: e.trackId,
      rank: e.rank,
    });
  }

  return { segments, entries };
}

export function createPlaylist(realm: Realm, name: string, groups: string[][] = []): Playlist {
  const now = new Date();
  const playlistId = newPlaylistId();
  const normalized = normalizePlaylistName(name) || 'New Playlist';

  return realm.write(() => {
    const playlist = realm.create(Playlist, {
      playlistId,
      name: normalized,
      entryCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    for (const trackIds of groups) {
      applyInWrite(realm, playlist, appendSegment(trackIds));
    }
    return playlist;
  });
}

/** Appends one segment holding these tracks, in order, at the end of the playlist. */
export function appendSegment(trackIds: string[]): PlaylistOperation {
  return {
    type: 'insert_segment',
    segmentId: newSegmentId(),
    entries: trackIds.map((trackId) => ({ entryId: newEntryId(), trackId })),
  };
}

/**
 * Applies operations in order, in one transaction: either all of them land or,
 * if one would exceed a limit, none do. Returns whether anything changed.
 */
export function applyOperations(
  realm: Realm,
  playlistId: string,
  operations: PlaylistOperation[]
): boolean {
  return realm.write(() => {
    const playlist = realm.objectForPrimaryKey(Playlist, playlistId);
    if (!playlist) {
      throw new Error('Playlist not found.');
    }
    let changed = false;
    for (const operation of operations) {
      changed = applyInWrite(realm, playlist, operation).status === 'applied' || changed;
    }
    return changed;
  });
}

function applyInWrite(
  realm: Realm,
  playlist: Playlist,
  operation: PlaylistOperation
): OperationResult {
  const snapshot = readPlaylistSnapshot(realm, playlist.playlistId);
  const outcome = applyPlaylistOperation(snapshot, operation);
  if (outcome.status !== 'applied') {
    return outcome;
  }

  const { changes } = outcome;
  const newEntries = changes.upsertEntries.filter((e) => !snapshot.entries.has(e.entryId)).length;
  const entryCount = snapshot.entries.size + newEntries - changes.deleteEntryIds.length;
  if (entryCount > PLAYLIST_LIMITS.entriesPerPlaylist) {
    throw new PlaylistLimitError(
      `A playlist can hold up to ${PLAYLIST_LIMITS.entriesPerPlaylist.toLocaleString()} tracks.`
    );
  }

  for (const segment of changes.upsertSegments) {
    realm.create(
      PlaylistSegment,
      { ...segment, playlistId: playlist.playlistId },
      Realm.UpdateMode.Modified
    );
  }
  for (const entry of changes.upsertEntries) {
    realm.create(
      PlaylistEntry,
      { ...entry, playlistId: playlist.playlistId },
      Realm.UpdateMode.Modified
    );
  }
  deleteByIds(realm, PlaylistEntry, changes.deleteEntryIds);
  deleteByIds(realm, PlaylistSegment, changes.deleteSegmentIds);

  playlist.entryCount = entryCount;
  playlist.updatedAt = new Date();
  return outcome;
}

/**
 * Replaces a playlist's structure with an earlier snapshot. Used by Undo on
 * device playlists, where IDs can be reused because nothing else holds them.
 * Account playlists will need inverse operations instead, because the server
 * never lets a deleted ID come back.
 */
export function restoreSnapshot(realm: Realm, playlistId: string, snapshot: PlaylistSnapshot) {
  realm.write(() => {
    const playlist = realm.objectForPrimaryKey(Playlist, playlistId);
    if (!playlist) {
      return;
    }
    const current = readPlaylistSnapshot(realm, playlistId);

    deleteByIds(
      realm,
      PlaylistEntry,
      [...current.entries.keys()].filter((id) => !snapshot.entries.has(id))
    );
    deleteByIds(
      realm,
      PlaylistSegment,
      [...current.segments.keys()].filter((id) => !snapshot.segments.has(id))
    );
    for (const segment of snapshot.segments.values()) {
      realm.create(PlaylistSegment, { ...segment, playlistId }, Realm.UpdateMode.Modified);
    }
    for (const entry of snapshot.entries.values()) {
      realm.create(PlaylistEntry, { ...entry, playlistId }, Realm.UpdateMode.Modified);
    }

    playlist.entryCount = snapshot.entries.size;
    playlist.updatedAt = new Date();
  });
}

export function updatePlaylistDetails(
  realm: Realm,
  playlistId: string,
  details: { name?: string; description?: string | null }
) {
  realm.write(() => {
    const playlist = realm.objectForPrimaryKey(Playlist, playlistId);
    if (!playlist) {
      return;
    }
    if (details.name !== undefined) {
      const name = normalizePlaylistName(details.name);
      if (name) {
        playlist.name = name;
      }
    }
    if (details.description !== undefined) {
      playlist.description = normalizePlaylistDescription(details.description ?? undefined);
    }
    playlist.updatedAt = new Date();
  });
}

/** Removes a playlist and its rows outright. Used to undo creating one. */
export function deletePlaylistPermanently(realm: Realm, playlistId: string) {
  realm.write(() => {
    realm.delete(realm.objects(PlaylistEntry).filtered('playlistId == $0', playlistId));
    realm.delete(realm.objects(PlaylistSegment).filtered('playlistId == $0', playlistId));
    const playlist = realm.objectForPrimaryKey(Playlist, playlistId);
    if (playlist) realm.delete(playlist);
  });
}

export function setPlaylistDeleted(realm: Realm, playlistId: string, deleted: boolean) {
  realm.write(() => {
    const playlist = realm.objectForPrimaryKey(Playlist, playlistId);
    if (playlist) {
      playlist.deletedAt = deleted ? new Date() : undefined;
    }
  });
}

/** Permanently removes playlists deleted more than RECENTLY_DELETED_DAYS ago. Runs at startup. */
export function purgeExpiredPlaylists(realm: Realm, now = new Date()) {
  const cutoff = new Date(now.getTime() - RECENTLY_DELETED_DAYS * 24 * 60 * 60 * 1000);
  const expired = realm.objects(Playlist).filtered('deletedAt != null AND deletedAt < $0', cutoff);
  if (expired.length === 0) {
    return;
  }

  realm.write(() => {
    for (const playlist of [...expired]) {
      const id = playlist.playlistId;
      realm.delete(realm.objects(PlaylistEntry).filtered('playlistId == $0', id));
      realm.delete(realm.objects(PlaylistSegment).filtered('playlistId == $0', id));
      realm.delete(playlist);
    }
  });
}

function deleteByIds(
  realm: Realm,
  type: typeof PlaylistEntry | typeof PlaylistSegment,
  ids: string[]
) {
  for (const id of ids) {
    const row = realm.objectForPrimaryKey<PlaylistEntry | PlaylistSegment>(type, id);
    if (row) {
      realm.delete(row);
    }
  }
}
