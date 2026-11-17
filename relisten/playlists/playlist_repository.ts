import Realm from 'realm';
import {
  Playlist,
  PlaylistEntry,
  PlaylistSegment,
} from '@/relisten/realm/models/playlists/playlist';
import {
  applyChanges,
  applyPlaylistOperation,
  type EntryState,
  type PlaylistOperation,
  type PlaylistSnapshot,
  type SegmentState,
  type WorkingSnapshot,
} from '@/relisten/playlists/playlist_operations';
import {
  discardUnsentPlaylist,
  issueCreateCommand,
  recordEdit,
  visibleOwnerId,
  withdrawUnsentOperations,
} from '@/relisten/playlists/sync/playlist_sync_state';
import type { MetadataEdit } from '@/relisten/playlists/sync/playlist_wire';
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

export function readPlaylistSnapshot(realm: Realm, playlistId: string): WorkingSnapshot {
  const segments = new Map<string, SegmentState>();
  for (const s of realm
    .objects(PlaylistSegment)
    .filtered('playlistId == $0 AND live == true', playlistId)) {
    segments.set(s.segmentId, { segmentId: s.segmentId, rank: s.rank });
  }

  const entries = new Map<string, EntryState>();
  for (const e of realm
    .objects(PlaylistEntry)
    .filtered('playlistId == $0 AND live == true', playlistId)) {
    entries.set(e.entryId, {
      entryId: e.entryId,
      segmentId: e.segmentId,
      trackId: e.trackId,
      rank: e.rank,
    });
  }

  return { segments, entries };
}

/**
 * Creates a playlist with these groups. While an account is the visible owner
 * the playlist belongs to it from the start, with a create command holding its
 * initial structure.
 */
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
    applyInWrite(realm, playlist, groups.map(appendSegment));
    const owner = visibleOwnerId(realm);
    if (owner) {
      playlist.ownerUserId = owner;
      issueCreateCommand(realm, playlist);
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

export interface AppliedEdit {
  changed: boolean;
  /** Outbox operations recorded for an account playlist; empty for device playlists. */
  operationIds: string[];
}

/**
 * Applies operations in order, in one transaction: either all of them land or,
 * if one would exceed a limit, none do. In an account playlist each operation
 * that changed something is also appended to the owner's outbox.
 */
export function applyOperations(
  realm: Realm,
  playlistId: string,
  operations: PlaylistOperation[]
): AppliedEdit {
  return realm.write(() => {
    const playlist = realm.objectForPrimaryKey(Playlist, playlistId);
    if (!playlist) {
      throw new Error('Playlist not found.');
    }
    return applyInWrite(realm, playlist, operations);
  });
}

/** Undoes an account playlist edit that has not been sent. Returns false once it has. */
export function withdrawEdit(realm: Realm, playlistId: string, operationIds: string[]): boolean {
  return realm.write(() => withdrawUnsentOperations(realm, playlistId, operationIds));
}

/**
 * Reads the playlist once and applies each operation to that working copy,
 * writing only the rows each one changed.
 */
function applyInWrite(
  realm: Realm,
  playlist: Playlist,
  operations: PlaylistOperation[]
): AppliedEdit {
  const snapshot = readPlaylistSnapshot(realm, playlist.playlistId);
  const operationIds: string[] = [];
  let changed = false;

  for (const operation of operations) {
    const { status, changes } = applyPlaylistOperation(snapshot, operation);
    if (status !== 'applied') {
      continue;
    }
    applyChanges(snapshot, changes);
    if (snapshot.entries.size > PLAYLIST_LIMITS.entriesPerPlaylist) {
      throw new PlaylistLimitError(
        `A playlist can hold up to ${PLAYLIST_LIMITS.entriesPerPlaylist.toLocaleString()} tracks.`
      );
    }
    changed = true;
    const operationId = recordEdit(realm, playlist, operation, changes);
    if (operationId) {
      operationIds.push(operationId);
    }
  }

  if (changed) {
    playlist.entryCount = snapshot.entries.size;
    playlist.updatedAt = new Date();
  }
  return { changed, operationIds };
}

/**
 * Replaces a playlist's structure with an earlier snapshot. Used by Undo on
 * device playlists, where IDs can be reused because nothing else holds them.
 * Account playlists withdraw unsent operations instead (`withdrawEdit`),
 * because the server never lets a deleted ID come back.
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
    const edit: MetadataEdit = { type: 'update_metadata' };
    if (details.name !== undefined) {
      const name = normalizePlaylistName(details.name);
      if (name && name !== playlist.name) {
        playlist.name = name;
        edit.name = name;
      }
    }
    if (details.description !== undefined) {
      const description = normalizePlaylistDescription(details.description ?? undefined);
      if ((description ?? null) !== (playlist.description ?? null)) {
        playlist.description = description;
        edit.description = description ?? null;
      }
    }
    if (edit.name === undefined && edit.description === undefined) {
      return;
    }
    playlist.updatedAt = new Date();
    recordEdit(realm, playlist, edit);
  });
}

/**
 * Removes a playlist and its rows outright, to undo creating one. An account
 * playlist can only be removed while its create command is still unsent;
 * returns false once the account may already have it.
 */
export function deletePlaylistPermanently(realm: Realm, playlistId: string): boolean {
  return realm.write(() => {
    const playlist = realm.objectForPrimaryKey(Playlist, playlistId);
    if (!playlist) {
      return true;
    }
    if (playlist.ownerUserId && !discardUnsentPlaylist(realm, playlist)) {
      return false;
    }
    realm.delete(realm.objects(PlaylistEntry).filtered('playlistId == $0', playlistId));
    realm.delete(realm.objects(PlaylistSegment).filtered('playlistId == $0', playlistId));
    realm.delete(playlist);
    return true;
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
