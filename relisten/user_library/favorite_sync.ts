import Realm from 'realm';
import {
  UserDataMigrationMarker,
  UserFavorite,
  UserFavoriteEntityType,
} from '@/relisten/realm/models/user_library';
import { RelistenUserLibraryApiClient } from '@/relisten/api/user_library_client';
import { scopedUserDataPrimaryKey } from '@/relisten/user_library/user_data_scope';

export const CATALOG_FAVORITES_MIGRATION_MARKER = 'catalog-favorites-to-scoped-v1';

export interface UserLibraryFavoriteResponse {
  entity_type: string;
  entity_uuid: string;
  created_at: string;
  updated_at: string;
}

export interface UserLibraryFavoriteTombstoneResponse {
  resource_type: string;
  entity_type?: string | null;
  entity_uuid?: string | null;
  deleted_at: string;
}

export interface CatalogFavoriteMigrationOptions {
  migratedAt?: Date;
}

export interface CatalogFavoriteMigrationResult {
  migrated: boolean;
  total: number;
  countsByEntityType: Partial<Record<UserFavoriteEntityType, number>>;
}

interface CatalogFavoriteSource {
  modelName: string;
  entityType: UserFavoriteEntityType;
}

const CATALOG_FAVORITE_SOURCES: CatalogFavoriteSource[] = [
  { modelName: 'Artist', entityType: UserFavoriteEntityType.Artist },
  { modelName: 'Show', entityType: UserFavoriteEntityType.Show },
  { modelName: 'Source', entityType: UserFavoriteEntityType.Source },
  { modelName: 'SourceTrack', entityType: UserFavoriteEntityType.Track },
  { modelName: 'Tour', entityType: UserFavoriteEntityType.Tour },
  { modelName: 'Song', entityType: UserFavoriteEntityType.Song },
];

export class UserLibraryFavoriteSyncError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'UserLibraryFavoriteSyncError';
  }
}

export function listUserLibraryFavorites(
  client: RelistenUserLibraryApiClient
): Promise<UserLibraryFavoriteResponse[]> {
  return client.getJson<UserLibraryFavoriteResponse[]>('/favorites');
}

export function putUserLibraryFavorite(
  client: RelistenUserLibraryApiClient,
  entityType: UserFavoriteEntityType,
  entityUuid: string
): Promise<UserLibraryFavoriteResponse> {
  return client.putJson<UserLibraryFavoriteResponse>(
    `/favorites/${entityType}/${encodeURIComponent(entityUuid)}`,
    {}
  );
}

export function deleteUserLibraryFavorite(
  client: RelistenUserLibraryApiClient,
  entityType: UserFavoriteEntityType,
  entityUuid: string
): Promise<void> {
  return client.deleteJson<void>(`/favorites/${entityType}/${encodeURIComponent(entityUuid)}`);
}

export function userFavoriteScopedId(
  scopeId: string,
  entityType: UserFavoriteEntityType,
  entityUuid: string
) {
  return scopedUserDataPrimaryKey(scopeId, `favorite:${entityType}:${entityUuid}`);
}

export function applyUserFavoriteChange(
  realm: Realm,
  scopeId: string,
  favorite: UserLibraryFavoriteResponse
) {
  const entityType = normalizeUserFavoriteEntityType(favorite.entity_type);
  const createdAt = parseServerDate(favorite.created_at, 'favorite.created_at');
  const updatedAt = parseServerDate(favorite.updated_at, 'favorite.updated_at');

  realm.create(
    UserFavorite.schema.name,
    {
      scopedId: userFavoriteScopedId(scopeId, entityType, favorite.entity_uuid),
      scopeId,
      entityType,
      entityUuid: favorite.entity_uuid,
      createdAt,
      updatedAt,
      deletedAt: null,
    },
    Realm.UpdateMode.Modified
  );
}

export function applyUserFavoriteTombstone(
  realm: Realm,
  scopeId: string,
  tombstone: UserLibraryFavoriteTombstoneResponse
) {
  if (tombstone.resource_type !== 'favorite' || !tombstone.entity_type || !tombstone.entity_uuid) {
    throw new UserLibraryFavoriteSyncError('unsupported_favorite_tombstone');
  }

  const entityType = normalizeUserFavoriteEntityType(tombstone.entity_type);
  const deletedAt = parseServerDate(tombstone.deleted_at, 'favorite.deleted_at');
  const scopedId = userFavoriteScopedId(scopeId, entityType, tombstone.entity_uuid);
  const existing = realm.objectForPrimaryKey(UserFavorite, scopedId);

  if (existing) {
    existing.deletedAt = deletedAt;
    existing.updatedAt = deletedAt;
    return;
  }

  realm.create(UserFavorite.schema.name, {
    scopedId,
    scopeId,
    entityType,
    entityUuid: tombstone.entity_uuid,
    createdAt: deletedAt,
    updatedAt: deletedAt,
    deletedAt,
  });
}

export function migrateCatalogFavoritesToScopedRows(
  realm: Realm,
  scopeId: string,
  options: CatalogFavoriteMigrationOptions = {}
): CatalogFavoriteMigrationResult {
  const migratedAt = options.migratedAt ?? new Date();
  const markerScopedId = scopedUserDataPrimaryKey(scopeId, CATALOG_FAVORITES_MIGRATION_MARKER);

  return write(realm, () => {
    if (realm.objectForPrimaryKey(UserDataMigrationMarker, markerScopedId)) {
      return { migrated: false, total: 0, countsByEntityType: {} };
    }

    const countsByEntityType: Partial<Record<UserFavoriteEntityType, number>> = {};

    for (const source of CATALOG_FAVORITE_SOURCES) {
      if (!realm.schema.some((schema) => schema.name === source.modelName)) {
        continue;
      }

      const favorites = realm.objects(source.modelName).filtered('isFavorite == true');

      for (const favorite of favorites) {
        const entityUuid = favorite.uuid as string | undefined;

        if (!entityUuid) {
          continue;
        }

        upsertMigratedFavorite(realm, scopeId, source.entityType, entityUuid, migratedAt);
        countsByEntityType[source.entityType] = (countsByEntityType[source.entityType] ?? 0) + 1;
      }
    }

    const total = Object.values(countsByEntityType).reduce((sum, count) => sum + count, 0);
    realm.create(UserDataMigrationMarker, {
      scopedId: markerScopedId,
      scopeId,
      marker: CATALOG_FAVORITES_MIGRATION_MARKER,
      completedAt: migratedAt,
      detailsJson: JSON.stringify({ countsByEntityType, total }),
    });

    return { migrated: true, total, countsByEntityType };
  });
}

export function normalizeUserFavoriteEntityType(entityType: string): UserFavoriteEntityType {
  switch (entityType) {
    case 'artist':
      return UserFavoriteEntityType.Artist;
    case 'show':
      return UserFavoriteEntityType.Show;
    case 'source':
      return UserFavoriteEntityType.Source;
    case 'track':
    case 'source_track':
      return UserFavoriteEntityType.Track;
    case 'tour':
      return UserFavoriteEntityType.Tour;
    case 'song':
      return UserFavoriteEntityType.Song;
    default:
      throw new UserLibraryFavoriteSyncError('unsupported_favorite_entity_type');
  }
}

function upsertMigratedFavorite(
  realm: Realm,
  scopeId: string,
  entityType: UserFavoriteEntityType,
  entityUuid: string,
  migratedAt: Date
) {
  const scopedId = userFavoriteScopedId(scopeId, entityType, entityUuid);
  const existing = realm.objectForPrimaryKey(UserFavorite, scopedId);

  realm.create(
    UserFavorite.schema.name,
    {
      scopedId,
      scopeId,
      entityType,
      entityUuid,
      createdAt: existing?.createdAt ?? migratedAt,
      updatedAt: migratedAt,
      deletedAt: null,
    },
    Realm.UpdateMode.Modified
  );
}

function parseServerDate(value: string, label: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new UserLibraryFavoriteSyncError(`invalid_${label}`);
  }

  return date;
}

function write<T>(realm: Realm, callback: () => T): T {
  return realm.isInTransaction ? callback() : realm.write(callback);
}
