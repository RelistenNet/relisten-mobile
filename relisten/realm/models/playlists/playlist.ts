import Realm from 'realm';

/**
 * A playlist in a listener's library: one they made, or one they follow. A
 * playlist they made works without an account; signing in gives it an owner
 * and saves it to that account. Catalog tracks are referenced by typed
 * `track_` IDs, not Realm links, so entries survive catalog eviction and
 * recordings that later disappear.
 *
 * Owned account playlists keep two states on the same rows: the canonical
 * fields hold the last state the server confirmed, and the displayed fields
 * hold that state with the owner's unconfirmed edits replayed on top (see
 * playlist_sync_state). A followed playlist is read-only and has only the
 * displayed fields, replaced whole from its public snapshot (see
 * followed_playlists).
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
      // Whose library the row is in on this device: the owner of a playlist
      // they made, or the follower. Null for a device playlist not yet saved
      // to an account. Visibility, sync and account isolation go by this.
      libraryUserId: { type: 'string', optional: true, indexed: true },
      // What `libraryUserId` may do with it. Only an owner edits, syncs an
      // outbox, archives or deletes.
      access: { type: 'string', default: 'owner' },
      // Who made the playlist, as data. Equal to `libraryUserId` for an owner.
      ownerUserId: { type: 'string', optional: true, indexed: true },
      // A followed playlist's owner, shown as "@username".
      ownerUsername: 'string?',
      // Sharing. The code is stable once issued, even while private.
      publicCode: 'string?',
      published: { type: 'bool', default: false },
      // Removed after a report: it can't be shared until a moderator lifts it.
      takenDown: { type: 'bool', default: false },
      // A followed playlist whose owner made it private, or that was taken
      // down or deleted. It keeps the last name it had until unfollowed.
      unavailable: { type: 'bool', default: false },
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
  libraryUserId?: string;
  access!: PlaylistAccess;
  ownerUserId?: string;
  ownerUsername?: string;
  publicCode?: string;
  published!: boolean;
  takenDown!: boolean;
  unavailable!: boolean;
  archived!: boolean;
  serverState?: PlaylistServerState;
  appliedRevision?: number;
  historyGeneration?: string;
  summaryRevision?: number;
  canonicalName?: string;
  canonicalDescription?: string;
}

/** Collaboration may later add `editor` and `viewer`. */
export type PlaylistAccess = 'owner' | 'follower';

/**
 * `creating` until the account has the playlist, then `synced`.
 * `needs_attention` when the account refused it (for example, full).
 */
export type PlaylistServerState = 'creating' | 'synced' | 'needs_attention';

/**
 * Guide text on a segment or entry. `description` is the Markdown source the
 * listener wrote. `descriptionMarkdown` is that source sanitized for the
 * renderer (see guide_markdown.ts), stored so rendering parses nothing.
 * `descriptionMarkdownKey` records the sanitizer version and the track duration
 * it was computed with; a row whose key no longer matches is re-sanitized.
 */
const guideTextProperties = {
  description: 'string?',
  canonicalDescription: 'string?',
  descriptionMarkdown: 'string?',
  descriptionMarkdownKey: 'string?',
} as const;

/**
 * An ordered block of entries that stays together through shuffle. A lone
 * track is a one-entry segment. A segment may have only a description (a
 * prose-only group) and no entries.
 */
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
      ...guideTextProperties,
    },
  };

  segmentId!: string;
  playlistId!: string;
  rank!: string;
  live!: boolean;
  canonicalRank?: string;
  canonicalLive!: boolean;
  description?: string;
  canonicalDescription?: string;
  descriptionMarkdown?: string;
  descriptionMarkdownKey?: string;
}

/**
 * One authored position in a playlist. The same track may appear in many
 * entries. An entry with no `trackId` is a text block: it has a description,
 * ranks among the tracks, and is never played, downloaded or hydrated.
 */
export class PlaylistEntry extends Realm.Object<PlaylistEntry> {
  static schema: Realm.ObjectSchema = {
    name: 'PlaylistEntry',
    primaryKey: 'entryId',
    properties: {
      entryId: 'string',
      playlistId: { type: 'string', indexed: true },
      segmentId: { type: 'string', indexed: true },
      trackId: { type: 'string', optional: true, indexed: true },
      rank: 'string',
      live: { type: 'bool', default: true, indexed: true },
      canonicalSegmentId: 'string?',
      canonicalRank: 'string?',
      canonicalLive: { type: 'bool', default: false },
      ...guideTextProperties,
    },
  };

  entryId!: string;
  playlistId!: string;
  segmentId!: string;
  trackId?: string;
  rank!: string;
  live!: boolean;
  canonicalSegmentId?: string;
  canonicalRank?: string;
  canonicalLive!: boolean;
  description?: string;
  canonicalDescription?: string;
  descriptionMarkdown?: string;
  descriptionMarkdownKey?: string;
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

/**
 * Where each operation state comes from (sync code in relisten/playlists/sync):
 *
 * | From | To | When |
 * | --- | --- | --- |
 * | (new) | pending | A listener edits an account playlist (`appendOperation`). |
 * | pending | in_flight | A batch is sent (`prepareBatch`). |
 * | in_flight | pending | Transport failure, 413 split, or the app stopped mid-request. |
 * | in_flight | acknowledged | The server applied it; kept until a pull confirms it. |
 * | in_flight | (deleted) | Accepted without a revision (no-op, target gone). |
 * | in_flight | needs_attention | Refused (`parent_missing`, `id_conflict`, a permanent 4xx). |
 * | pending, in_flight | quota_paused | The account is full. |
 * | quota_paused | pending | Another edit to the playlist, or a deletion synced. |
 * | pending, in_flight | archived_hold | The playlist was archived elsewhere. |
 * | archived_hold | pending | The playlist is restored, here or elsewhere. |
 * | acknowledged | (deleted) | A pull in the same generation reached its revision. |
 * | acknowledged, in_flight | pending | Restore recovery (history generation changed). |
 * | needs_attention | (deleted) | The listener dismisses it or adds the tracks again. |
 */
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
      libraryUserId: { type: 'string', indexed: true },
      localSequence: 'int',
      operationJson: 'string',
      baseRevision: 'int',
      state: { type: 'string', indexed: true },
      attemptCount: { type: 'int', default: 0 },
      lastErrorCode: 'string?',
      resultRevision: 'int?',
      resultGeneration: 'string?',
      createdAt: 'date',
    },
  };

  operationId!: string;
  playlistId!: string;
  /** The account whose outbox this edit is in: the library the playlist is saved to. */
  libraryUserId!: string;
  localSequence!: number;
  operationJson!: string;
  baseRevision!: number;
  state!: PlaylistOperationState;
  attemptCount!: number;
  lastErrorCode?: string;
  resultRevision?: number;
  resultGeneration?: string;
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
      libraryUserId: { type: 'string', indexed: true },
      requestJson: 'string',
      state: { type: 'string', indexed: true },
      attemptCount: { type: 'int', default: 0 },
      lastErrorCode: 'string?',
      createdAt: 'date',
    },
  };

  commandId!: string;
  playlistId!: string;
  /** The account the playlist is created on. */
  libraryUserId!: string;
  requestJson!: string;
  state!: 'pending' | 'needs_attention';
  attemptCount!: number;
  lastErrorCode?: string;
  createdAt!: Date;
}

/**
 * Copies a public playlist into the listener's account. It is written before
 * the request is sent and kept until the outcome is known, so a retry after a
 * network error or a restart reuses the command ID, and the server returns the
 * copy it already made instead of making another.
 */
export class PlaylistCopyCommand extends Realm.Object<PlaylistCopyCommand> {
  static schema: Realm.ObjectSchema = {
    name: 'PlaylistCopyCommand',
    primaryKey: 'commandId',
    properties: {
      commandId: 'string',
      publicCode: 'string',
      userId: { type: 'string', indexed: true },
      createdAt: 'date',
    },
  };

  commandId!: string;
  publicCode!: string;
  userId!: string;
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
  PlaylistCopyCommand,
  PlaylistDeviceState,
];
