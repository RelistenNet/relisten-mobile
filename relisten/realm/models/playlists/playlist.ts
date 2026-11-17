import Realm from 'realm';

/**
 * A listener's playlist. It works without an account; signing in gives it an
 * owner and saves it to that account. Catalog tracks are referenced by typed
 * `track_` IDs, not Realm links, so entries survive catalog eviction and
 * recordings that later disappear.
 *
 * Account playlists keep two states on the same rows: the canonical fields hold
 * the last state the server confirmed, and the displayed fields hold that state
 * with the owner's unconfirmed edits replayed on top (see playlist_sync_state).
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
      // Account playlists (schema 26). Unowned playlists leave these empty.
      ownerUserId: { type: 'string', optional: true, indexed: true },
      // Deleting an account playlist archives it on the server.
      archived: { type: 'bool', default: false },
      serverState: 'string?',
      appliedRevision: 'int?',
      historyGeneration: 'string?',
      summaryRevision: 'int?',
      canonicalName: 'string?',
      canonicalDescription: 'string?',
    },
  };

  playlistId!: string;
  name!: string;
  description?: string;
  entryCount!: number;
  deletedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
  ownerUserId?: string;
  archived!: boolean;
  serverState?: PlaylistServerState;
  appliedRevision?: number;
  historyGeneration?: string;
  summaryRevision?: number;
  canonicalName?: string;
  canonicalDescription?: string;
}

/**
 * `creating` until the account has the playlist, then `synced`.
 * `needs_attention` when the account refused it (for example, full).
 */
export type PlaylistServerState = 'creating' | 'synced' | 'needs_attention';

/** An ordered block of entries that stays together through shuffle. A lone track is a one-entry segment. */
export class PlaylistSegment extends Realm.Object<PlaylistSegment> {
  static schema: Realm.ObjectSchema = {
    name: 'PlaylistSegment',
    primaryKey: 'segmentId',
    properties: {
      segmentId: 'string',
      playlistId: { type: 'string', indexed: true },
      rank: 'string',
      // False while an unconfirmed edit hides a row the server still has.
      live: { type: 'bool', default: true, indexed: true },
      canonicalRank: 'string?',
      canonicalLive: { type: 'bool', default: false },
    },
  };

  segmentId!: string;
  playlistId!: string;
  rank!: string;
  live!: boolean;
  canonicalRank?: string;
  canonicalLive!: boolean;
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
      live: { type: 'bool', default: true, indexed: true },
      canonicalSegmentId: 'string?',
      canonicalRank: 'string?',
      canonicalLive: { type: 'bool', default: false },
    },
  };

  entryId!: string;
  playlistId!: string;
  segmentId!: string;
  trackId!: string;
  rank!: string;
  live!: boolean;
  canonicalSegmentId?: string;
  canonicalRank?: string;
  canonicalLive!: boolean;
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

export type PlaylistOperationState =
  /** Not sent yet, or waiting to retry after a transport failure. */
  | 'pending'
  | 'in_flight'
  /** Applied by the server; kept until a pull reaches its result revision. */
  | 'acknowledged'
  /** The account is full; resent whole after the next edit or a deletion elsewhere. */
  | 'quota_paused'
  /** The playlist was archived on another device. */
  | 'archived_hold'
  /** Refused by the server; shown to the listener. */
  | 'needs_attention';

/**
 * One edit to an account playlist, waiting for or confirmed by the server.
 * `operationJson` holds the engine operation; the wire payload is derived from
 * it the same way on every attempt, so a retry is an exact replay.
 */
export class PlaylistOperation extends Realm.Object<PlaylistOperation> {
  static schema: Realm.ObjectSchema = {
    name: 'PlaylistOperation',
    primaryKey: 'operationId',
    properties: {
      operationId: 'string',
      playlistId: { type: 'string', indexed: true },
      ownerUserId: { type: 'string', indexed: true },
      localSequence: 'int',
      operationJson: 'string',
      baseRevision: 'int',
      state: { type: 'string', indexed: true },
      attemptCount: { type: 'int', default: 0 },
      lastErrorCode: 'string?',
      resultRevision: 'int?',
      resultGeneration: 'string?',
      failedTrackIds: 'string[]',
      createdAt: 'date',
    },
  };

  operationId!: string;
  playlistId!: string;
  ownerUserId!: string;
  localSequence!: number;
  operationJson!: string;
  baseRevision!: number;
  state!: PlaylistOperationState;
  attemptCount!: number;
  lastErrorCode?: string;
  resultRevision?: number;
  resultGeneration?: string;
  failedTrackIds!: Realm.List<string>;
  createdAt!: Date;
}

/**
 * Creates a playlist on the account. The request body is frozen when the
 * playlist gets its owner, so retries are exact replays and never duplicate it.
 */
export class PlaylistCommand extends Realm.Object<PlaylistCommand> {
  static schema: Realm.ObjectSchema = {
    name: 'PlaylistCommand',
    primaryKey: 'commandId',
    properties: {
      commandId: 'string',
      playlistId: { type: 'string', indexed: true },
      ownerUserId: { type: 'string', indexed: true },
      requestJson: 'string',
      state: { type: 'string', indexed: true },
      attemptCount: { type: 'int', default: 0 },
      lastErrorCode: 'string?',
      createdAt: 'date',
    },
  };

  commandId!: string;
  playlistId!: string;
  ownerUserId!: string;
  requestJson!: string;
  state!: 'pending' | 'needs_attention';
  attemptCount!: number;
  lastErrorCode?: string;
  createdAt!: Date;
}

/**
 * Device-wide playlist settings. The last signed-in account stays the visible
 * owner after signing out, so its playlists stay listed and editable.
 */
export class PlaylistDeviceState extends Realm.Object<PlaylistDeviceState> {
  static schema: Realm.ObjectSchema = {
    name: 'PlaylistDeviceState',
    primaryKey: 'id',
    properties: {
      id: 'string',
      lastSignedInUserId: 'string?',
      nextOperationSequence: { type: 'int', default: 1 },
    },
  };

  id!: string;
  lastSignedInUserId?: string;
  nextOperationSequence!: number;
}

export const PLAYLIST_DEVICE_STATE_ID = 'device';

export const PLAYLIST_REALM_MODELS = [
  Playlist,
  PlaylistSegment,
  PlaylistEntry,
  PlaylistTrackAvailability,
  PlaylistOperation,
  PlaylistCommand,
  PlaylistDeviceState,
];
