import Realm from 'realm';
import {
  UserPlaylist,
  UserPlaylistAccessRole,
  UserPlaylistEntry,
  UserPlaylistVisibility,
} from '@/relisten/realm/models/user_library/playlists';
import { UserSyncCursor } from '@/relisten/realm/models/user_library/sync';
import { scopedUserDataPrimaryKey } from '@/relisten/user_library/user_data_scope';
import {
  RelistenUserLibraryApiClient,
  UserLibraryRequestOptions,
} from '@/relisten/api/user_library_client';
import {
  applyUserFavoriteChange,
  applyUserFavoriteTombstone,
  migrateCatalogFavoritesToScopedRows,
  UserLibraryFavoriteResponse,
} from '@/relisten/user_library/favorite_sync';

export const USER_LIBRARY_SYNC_CURSOR_NAME = 'user-library-sync';

export interface UserLibrarySyncResponse {
  changes: UserLibrarySyncChangeResponse[];
  tombstones: UserLibrarySyncTombstoneResponse[];
  next_cursor: string;
}

export interface UserLibrarySyncChangeResponse {
  resource_type: string;
  favorite?: UserLibraryFavoriteResponse;
  playlist?: UserLibraryPlaylistResponse;
  playlist_viewer_state?: UserLibraryPlaylistViewerStateResponse;
  updated_at: string;
}

export interface UserLibraryPlaylistResponse {
  playlist_uuid: string;
  short_id: string;
  owner_user_uuid: string;
  name: string;
  description?: string | null;
  visibility: UserPlaylistVisibility;
  current_revision: number;
  entries: UserLibraryPlaylistEntryResponse[];
}

export interface UserLibraryPlaylistEntryResponse {
  playlist_entry_uuid: string;
  source_track_uuid: string;
  block_uuid?: string | null;
  block_position?: number | null;
  position: string;
  added_by_user_uuid: string;
}

export interface UserLibraryPlaylistViewerStateResponse {
  is_owner: boolean;
  is_following: boolean;
  is_collaborator: boolean;
  can_edit: boolean;
  access_role: UserPlaylistAccessRole;
}

export interface UserLibraryPlaylistSnapshotChange {
  playlist: UserLibraryPlaylistResponse;
  playlist_viewer_state?: UserLibraryPlaylistViewerStateResponse;
  updated_at: string;
}

export interface UserLibrarySyncTombstoneResponse {
  resource_type: string;
  entity_type?: string | null;
  entity_uuid?: string | null;
  playlist_uuid?: string | null;
  deleted_at: string;
}

export class UserLibraryPlaylistSyncError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'UserLibraryPlaylistSyncError';
  }
}

export function pullUserLibrarySync(
  client: RelistenUserLibraryApiClient,
  cursor?: string,
  options?: UserLibraryRequestOptions
): Promise<UserLibrarySyncResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const path = `/sync${query}`;
  return options
    ? client.getJson<UserLibrarySyncResponse>(path, options)
    : client.getJson<UserLibrarySyncResponse>(path);
}

export function userLibrarySyncCursorScopedId(scopeId: string) {
  return scopedUserDataPrimaryKey(scopeId, `cursor:${USER_LIBRARY_SYNC_CURSOR_NAME}`);
}

export class UserLibraryPlaylistSyncApplier {
  constructor(private readonly realm: Realm) {}

  applyPullResponse(scopeId: string, response: UserLibrarySyncResponse): void {
    assertSupportedResponse(response);

    this.write(() => {
      migrateCatalogFavoritesToScopedRows(this.realm, scopeId);

      for (const change of response.changes) {
        this.applyChange(scopeId, change);
      }

      for (const tombstone of response.tombstones) {
        this.applyTombstone(scopeId, tombstone);
      }

      this.persistCursor(scopeId, response.next_cursor);
    });
  }

  getCursor(scopeId: string): UserSyncCursor | null {
    return this.realm.objectForPrimaryKey(UserSyncCursor, userLibrarySyncCursorScopedId(scopeId));
  }

  private applyChange(scopeId: string, change: UserLibrarySyncChangeResponse) {
    if (change.resource_type === 'favorite' && change.favorite) {
      applyUserFavoriteChange(this.realm, scopeId, change.favorite);
      return;
    }

    if (change.resource_type === 'playlist' && change.playlist) {
      this.applyPlaylistChange(scopeId, change);
      return;
    }

    throw new UserLibraryPlaylistSyncError('unsupported_sync_change');
  }

  private applyPlaylistChange(scopeId: string, change: UserLibrarySyncChangeResponse) {
    const playlist = change.playlist;

    if (!playlist) {
      throw new UserLibraryPlaylistSyncError('missing_playlist_change');
    }

    applyUserLibraryPlaylistSnapshot(this.realm, scopeId, {
      playlist,
      playlist_viewer_state: change.playlist_viewer_state,
      updated_at: change.updated_at,
    });
  }

  private applyTombstone(scopeId: string, tombstone: UserLibrarySyncTombstoneResponse) {
    if (tombstone.resource_type === 'favorite') {
      applyUserFavoriteTombstone(this.realm, scopeId, tombstone);
      return;
    }

    if (!isPlaylistTombstone(tombstone) || !tombstone.playlist_uuid) {
      throw new UserLibraryPlaylistSyncError('unsupported_sync_tombstone');
    }

    const deletedAt = parseServerDate(tombstone.deleted_at, 'tombstone.deleted_at');
    const playlist = this.realm.objectForPrimaryKey(
      UserPlaylist,
      scopedUserDataPrimaryKey(scopeId, tombstone.playlist_uuid)
    );

    if (playlist) {
      playlist.deletedAt = deletedAt;
    }

    const entries = this.realm
      .objects(UserPlaylistEntry)
      .filtered('scopeId == $0 AND playlistUuid == $1', scopeId, tombstone.playlist_uuid);

    for (const entry of entries) {
      entry.deletedAt = deletedAt;
    }
  }

  private persistCursor(scopeId: string, cursor: string) {
    this.realm.create(
      UserSyncCursor,
      {
        scopedId: userLibrarySyncCursorScopedId(scopeId),
        scopeId,
        cursorName: USER_LIBRARY_SYNC_CURSOR_NAME,
        cursor,
        updatedAt: new Date(),
      },
      Realm.UpdateMode.Modified
    );
  }

  private write<T>(callback: () => T): T {
    return this.realm.isInTransaction ? callback() : this.realm.write(callback);
  }
}

export function applyUserLibraryPlaylistSnapshot(
  realm: Realm,
  scopeId: string,
  change: UserLibraryPlaylistSnapshotChange
) {
  const playlist = change.playlist;
  const viewerState = change.playlist_viewer_state;
  const updatedAt = parseServerDate(change.updated_at, 'change.updated_at');
  const playlistScopedId = scopedUserDataPrimaryKey(scopeId, playlist.playlist_uuid);
  const existing = realm.objectForPrimaryKey(UserPlaylist, playlistScopedId);

  realm.create(
    UserPlaylist.schema.name,
    {
      scopedId: playlistScopedId,
      scopeId,
      uuid: playlist.playlist_uuid,
      shortId: playlist.short_id,
      name: playlist.name,
      description: playlist.description ?? null,
      visibility: playlist.visibility,
      ownerUserUuid: playlist.owner_user_uuid,
      accessRole: viewerState ? viewerState.access_role : (existing?.accessRole ?? null),
      isOwner: viewerState ? viewerState.is_owner : (existing?.isOwner ?? null),
      isFollowing: viewerState ? viewerState.is_following : (existing?.isFollowing ?? null),
      isCollaborator: viewerState
        ? viewerState.is_collaborator
        : (existing?.isCollaborator ?? null),
      canEdit: viewerState ? viewerState.can_edit : (existing?.canEdit ?? null),
      currentRevision: playlist.current_revision,
      createdAt: existing?.createdAt ?? updatedAt,
      updatedAt,
      deletedAt: null,
    },
    Realm.UpdateMode.Modified
  );

  replaceUserLibraryPlaylistEntries(realm, scopeId, playlist, updatedAt);
}

function replaceUserLibraryPlaylistEntries(
  realm: Realm,
  scopeId: string,
  playlist: UserLibraryPlaylistResponse,
  updatedAt: Date
) {
  const receivedEntryUuids = new Set(playlist.entries.map((entry) => entry.playlist_entry_uuid));
  const existingEntries = realm
    .objects(UserPlaylistEntry)
    .filtered('scopeId == $0 AND playlistUuid == $1', scopeId, playlist.playlist_uuid);

  for (const existingEntry of existingEntries) {
    if (!receivedEntryUuids.has(existingEntry.uuid)) {
      existingEntry.deletedAt = updatedAt;
    }
  }

  for (const entry of playlist.entries) {
    const scopedId = scopedUserDataPrimaryKey(scopeId, entry.playlist_entry_uuid);
    const existing = realm.objectForPrimaryKey(UserPlaylistEntry, scopedId);

    realm.create(
      UserPlaylistEntry.schema.name,
      {
        scopedId,
        scopeId,
        uuid: entry.playlist_entry_uuid,
        playlistUuid: playlist.playlist_uuid,
        sourceTrackUuid: entry.source_track_uuid,
        addedByUserUuid: entry.added_by_user_uuid,
        blockUuid: entry.block_uuid ?? null,
        blockPosition: entry.block_position ?? null,
        position: entry.position,
        createdAt: existing?.createdAt ?? updatedAt,
        updatedAt,
        deletedAt: null,
      },
      Realm.UpdateMode.Modified
    );
  }
}

function assertSupportedResponse(response: UserLibrarySyncResponse) {
  const unsupportedChange = response.changes.find(
    (change) =>
      !(
        (change.resource_type === 'playlist' && change.playlist) ||
        (change.resource_type === 'favorite' && change.favorite)
      )
  );

  if (unsupportedChange) {
    throw new UserLibraryPlaylistSyncError('unsupported_sync_change');
  }

  const unsupportedTombstone = response.tombstones.find((tombstone) => {
    return !(
      (isPlaylistTombstone(tombstone) && tombstone.playlist_uuid) ||
      (tombstone.resource_type === 'favorite' && tombstone.entity_type && tombstone.entity_uuid)
    );
  });

  if (unsupportedTombstone) {
    throw new UserLibraryPlaylistSyncError('unsupported_sync_tombstone');
  }
}

function isPlaylistTombstone(tombstone: UserLibrarySyncTombstoneResponse) {
  return tombstone.resource_type === 'playlist' || tombstone.resource_type === 'playlist_access';
}

function parseServerDate(value: string, label: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new UserLibraryPlaylistSyncError(`invalid_${label}`);
  }

  return date;
}
