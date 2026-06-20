import Realm from 'realm';
import { RelistenUserLibraryApiClient } from '@/relisten/api/user_library_client';
import { UserFavorite, UserFavoriteEntityType } from '@/relisten/realm/models/user_library';
import {
  applyUserFavoriteChange,
  deleteUserLibraryFavorite,
  putUserLibraryFavorite,
  userFavoriteScopedId,
} from '@/relisten/user_library/favorite_sync';

export interface UserLibraryFavoriteMutationAuthSession {
  withAuthenticatedSessionRetry<T>(
    request: (
      session:
        | {
            accessToken: string;
            scopeId: string;
          }
        | undefined
    ) => Promise<T>,
    options?: { expectedScopeId?: string }
  ): Promise<T>;
}

export interface SetScopedFavoriteOptions {
  now?: Date;
}

export interface CatalogFavoriteDescriptor {
  entityType: UserFavoriteEntityType;
  entityUuid: string;
}

interface CatalogFavoriteModel {
  uuid?: string;
  constructor: {
    schema?: {
      name?: string;
    };
    name?: string;
  };
}

const CATALOG_MODEL_FAVORITE_TYPES: Partial<Record<string, UserFavoriteEntityType>> = {
  Artist: UserFavoriteEntityType.Artist,
  Show: UserFavoriteEntityType.Show,
  Source: UserFavoriteEntityType.Source,
  SourceTrack: UserFavoriteEntityType.Track,
  Tour: UserFavoriteEntityType.Tour,
  Song: UserFavoriteEntityType.Song,
};

interface FavoriteSnapshot {
  existed: boolean;
  scopeId?: string;
  entityType?: UserFavoriteEntityType;
  entityUuid?: string;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

export class UserLibraryFavoriteMutationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'UserLibraryFavoriteMutationError';
  }
}

export class UserLibraryFavoriteMutationService {
  constructor(
    private readonly realm: Realm,
    private readonly client: RelistenUserLibraryApiClient,
    private readonly authSession: UserLibraryFavoriteMutationAuthSession
  ) {}

  async setFavorite(
    scopeId: string,
    entityType: UserFavoriteEntityType,
    entityUuid: string,
    isFavorite: boolean,
    options: SetScopedFavoriteOptions = {}
  ): Promise<void> {
    const scopedId = userFavoriteScopedId(scopeId, entityType, entityUuid);
    const previous = snapshotFavorite(this.realm, scopedId);

    setScopedFavoriteState(this.realm, scopeId, entityType, entityUuid, isFavorite, options);

    try {
      if (isFavorite) {
        const response = await this.authenticatedRequest(scopeId, (accessToken) =>
          putUserLibraryFavorite(this.client, entityType, entityUuid, { accessToken })
        );

        write(this.realm, () => applyUserFavoriteChange(this.realm, scopeId, response));
      } else {
        await this.authenticatedRequest(scopeId, (accessToken) =>
          deleteUserLibraryFavorite(this.client, entityType, entityUuid, { accessToken })
        );

        setScopedFavoriteState(this.realm, scopeId, entityType, entityUuid, false, options);
      }
    } catch (error) {
      restoreFavoriteSnapshot(this.realm, scopedId, previous);
      throw error;
    }
  }

  private authenticatedRequest<T>(
    scopeId: string,
    request: (accessToken: string) => Promise<T>
  ): Promise<T> {
    return this.authSession.withAuthenticatedSessionRetry(
      (session) => {
        if (!session) {
          throw new UserLibraryFavoriteMutationError('missing_auth_session');
        }

        if (session.scopeId !== scopeId) {
          throw new UserLibraryFavoriteMutationError('session_scope_mismatch');
        }

        return request(session.accessToken);
      },
      { expectedScopeId: scopeId }
    );
  }
}

export function catalogFavoriteDescriptorForObject(
  object: CatalogFavoriteModel
): CatalogFavoriteDescriptor | undefined {
  const modelName = object.constructor.schema?.name ?? object.constructor.name;
  const entityType = CATALOG_MODEL_FAVORITE_TYPES[modelName ?? ''];
  const entityUuid = object.uuid?.trim();

  if (!entityType || !entityUuid) {
    return undefined;
  }

  return { entityType, entityUuid };
}

export function isActiveScopedFavorite(
  realm: Realm,
  scopeId: string,
  entityType: UserFavoriteEntityType,
  entityUuid: string
): boolean {
  const favorite = realm.objectForPrimaryKey(
    UserFavorite,
    userFavoriteScopedId(scopeId, entityType, entityUuid)
  );

  return isActiveFavoriteRow(favorite);
}

export function isActiveFavoriteRow(favorite: UserFavorite | null | undefined): boolean {
  return !!favorite && !favorite.deletedAt;
}

export function setScopedFavoriteState(
  realm: Realm,
  scopeId: string,
  entityType: UserFavoriteEntityType,
  entityUuid: string,
  isFavorite: boolean,
  options: SetScopedFavoriteOptions = {}
): UserFavorite {
  const now = options.now ?? new Date();
  const scopedId = userFavoriteScopedId(scopeId, entityType, entityUuid);
  const existing = realm.objectForPrimaryKey(UserFavorite, scopedId);

  return write(realm, () =>
    realm.create(
      UserFavorite.schema.name,
      {
        scopedId,
        scopeId,
        entityType,
        entityUuid,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: isFavorite ? null : now,
      },
      Realm.UpdateMode.Modified
    )
  ) as unknown as UserFavorite;
}

function snapshotFavorite(realm: Realm, scopedId: string): FavoriteSnapshot {
  const favorite = realm.objectForPrimaryKey(UserFavorite, scopedId);

  if (!favorite) {
    return { existed: false };
  }

  return {
    existed: true,
    scopeId: favorite.scopeId,
    entityType: favorite.entityType,
    entityUuid: favorite.entityUuid,
    createdAt: favorite.createdAt,
    updatedAt: favorite.updatedAt,
    deletedAt: favorite.deletedAt,
  };
}

function restoreFavoriteSnapshot(realm: Realm, scopedId: string, snapshot: FavoriteSnapshot) {
  write(realm, () => {
    const existing = realm.objectForPrimaryKey(UserFavorite, scopedId);

    if (!snapshot.existed) {
      if (existing) {
        realm.delete(existing);
      }
      return;
    }

    if (
      !snapshot.scopeId ||
      !snapshot.entityType ||
      !snapshot.entityUuid ||
      !snapshot.createdAt ||
      !snapshot.updatedAt
    ) {
      throw new UserLibraryFavoriteMutationError('invalid_favorite_snapshot');
    }

    realm.create(
      UserFavorite.schema.name,
      {
        scopedId,
        scopeId: snapshot.scopeId,
        entityType: snapshot.entityType,
        entityUuid: snapshot.entityUuid,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
        deletedAt: snapshot.deletedAt ?? null,
      },
      Realm.UpdateMode.Modified
    );
  });
}

function write<T>(realm: Realm, callback: () => T): T {
  return realm.isInTransaction ? callback() : realm.write(callback);
}
