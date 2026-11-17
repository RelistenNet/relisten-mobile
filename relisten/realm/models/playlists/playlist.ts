import Realm from 'realm';

/**
 * A listener's playlist. It lives on the device and works without an account.
 * Catalog tracks are referenced by typed `track_` IDs, not Realm links, so entries
 * survive catalog eviction and recordings that later disappear.
 */
export class Playlist extends Realm.Object<Playlist> {
  static schema: Realm.ObjectSchema = {
    name: 'Playlist',
    primaryKey: 'playlistId',
    properties: {
      playlistId: 'string',
      name: 'string',
      description: 'string?',
      // Denormalized so lists can show counts without loading every entry.
      entryCount: { type: 'int', default: 0 },
      // Soft delete: the playlist shows in Recently Deleted and is purged after 30 days.
      deletedAt: { type: 'date', optional: true, indexed: true },
      createdAt: 'date',
      updatedAt: { type: 'date', indexed: true },
    },
  };

  playlistId!: string;
  name!: string;
  description?: string;
  entryCount!: number;
  deletedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

/** An ordered block of entries that stays together through shuffle. A lone track is a one-entry segment. */
export class PlaylistSegment extends Realm.Object<PlaylistSegment> {
  static schema: Realm.ObjectSchema = {
    name: 'PlaylistSegment',
    primaryKey: 'segmentId',
    properties: {
      segmentId: 'string',
      playlistId: { type: 'string', indexed: true },
      rank: 'string',
    },
  };

  segmentId!: string;
  playlistId!: string;
  rank!: string;
}

/** One authored position in a playlist. The same track may appear in many entries. */
export class PlaylistEntry extends Realm.Object<PlaylistEntry> {
  static schema: Realm.ObjectSchema = {
    name: 'PlaylistEntry',
    primaryKey: 'entryId',
    properties: {
      entryId: 'string',
      playlistId: { type: 'string', indexed: true },
      segmentId: { type: 'string', indexed: true },
      trackId: { type: 'string', indexed: true },
      rank: 'string',
    },
  };

  entryId!: string;
  playlistId!: string;
  segmentId!: string;
  trackId!: string;
  rank!: string;
}

/**
 * What the catalog last said about a playlist track that isn't simply available:
 * `unavailable` (gone or retired) or `redirected` to another track. Stored on the
 * playlist side because `SourceTrack.deletedAt` belongs to catalog sync and catalog
 * redirects only cover songs and venues. The entry keeps its original `trackId`.
 */
export class PlaylistTrackAvailability extends Realm.Object<PlaylistTrackAvailability> {
  static schema: Realm.ObjectSchema = {
    name: 'PlaylistTrackAvailability',
    primaryKey: 'trackId',
    properties: {
      trackId: 'string',
      status: 'string',
      redirectTrackId: 'string?',
      checkedAt: 'date',
    },
  };

  trackId!: string;
  status!: 'unavailable' | 'redirected';
  redirectTrackId?: string;
  checkedAt!: Date;
}

export const PLAYLIST_REALM_MODELS = [
  Playlist,
  PlaylistSegment,
  PlaylistEntry,
  PlaylistTrackAvailability,
];
