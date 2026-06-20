import { LayoutAnimation } from 'react-native';
import { useCallback, useMemo } from 'react';
import { FavoritableObject } from '@/relisten/realm/favoritable_object';
import { useForceUpdate } from '@/relisten/util/forced_update';
import { useObject, useQuery, useRealm } from '@/relisten/realm/schema';
import {
  ActiveUserDataScope,
  ACTIVE_USER_DATA_SCOPE_KEY,
} from '@/relisten/realm/models/user_library/scope';
import { UserFavorite } from '@/relisten/realm/models/user_library';
import {
  catalogFavoriteDescriptorForObject,
  isActiveFavoriteRow,
} from '@/relisten/user_library/favorite_state';
import { getSharedUserLibraryFavoriteMutationService } from '@/relisten/user_library/favorite_state_services';
import { UserDataScopeKind } from '@/relisten/user_library/user_data_scope';
import { DefaultLayoutAnimationConfig } from '@/relisten/layout_animation_config';
import { log } from '@/relisten/util/logging';

const logger = log.extend('favorite');

export interface CatalogFavoriteState {
  isFavorited: boolean;
  isUsingScopedFavorite: boolean;
  setFavorite(isFavorite: boolean): void;
  toggleFavorite(): void;
}

function setLegacyCatalogFavorite<T extends FavoritableObject>(
  realm: ReturnType<typeof useRealm>,
  object: T,
  nextFavorite: boolean,
  forceUpdate: () => void
) {
  realm.write(() => {
    object.isFavorite = nextFavorite;
    forceUpdate();
  });
}

export function useCatalogFavoriteState<T extends FavoritableObject & { uuid: string }>(
  object?: T | null
): CatalogFavoriteState {
  const realm = useRealm();
  const forceUpdate = useForceUpdate();
  const activeScope = useObject(ActiveUserDataScope, ACTIVE_USER_DATA_SCOPE_KEY, [
    'scopeId',
    'scopeKind',
  ]);
  const favoriteDescriptor = useMemo(
    () => (object ? catalogFavoriteDescriptorForObject(object) : undefined),
    [object]
  );
  const favoriteEntityType = favoriteDescriptor?.entityType;
  const favoriteEntityUuid = favoriteDescriptor?.entityUuid;
  const scopedFavoriteScopeId =
    activeScope?.scopeKind === UserDataScopeKind.Authenticated &&
    favoriteEntityType &&
    favoriteEntityUuid
      ? activeScope.scopeId
      : undefined;
  const activeScopedFavorites = useQuery(
    UserFavorite,
    (query) =>
      scopedFavoriteScopeId && favoriteEntityType && favoriteEntityUuid
        ? query.filtered(
            'scopeId == $0 && entityType == $1 && entityUuid == $2',
            scopedFavoriteScopeId,
            favoriteEntityType,
            favoriteEntityUuid
          )
        : query.filtered('scopeId == $0', '__no_active_scope__'),
    [favoriteEntityType, favoriteEntityUuid, scopedFavoriteScopeId]
  );
  const mutationService = useMemo(
    () => getSharedUserLibraryFavoriteMutationService(realm),
    [realm]
  );
  const isUsingScopedFavorite =
    !!scopedFavoriteScopeId && !!favoriteEntityType && !!favoriteEntityUuid;
  // During rollout, signed-out users keep using catalog `isFavorite` booleans.
  // Signed-in users read/write scoped UserFavorite rows so account state does
  // not mutate the shared catalog cache.
  const isFavorited =
    object && isUsingScopedFavorite
      ? isActiveFavoriteRow(activeScopedFavorites[0])
      : !!object?.isFavorite;

  const setFavorite = useCallback(
    (nextFavorite: boolean) => {
      if (!object) {
        return;
      }

      LayoutAnimation.configureNext(DefaultLayoutAnimationConfig);

      if (!scopedFavoriteScopeId || !favoriteEntityType || !favoriteEntityUuid) {
        setLegacyCatalogFavorite(realm, object, nextFavorite, forceUpdate);
        return;
      }

      void mutationService
        .setFavorite(scopedFavoriteScopeId, favoriteEntityType, favoriteEntityUuid, nextFavorite)
        .catch((error) => {
          logger.warn(`favorite mutation failed: ${errorCode(error)}`);
        });
    },
    [
      favoriteEntityType,
      favoriteEntityUuid,
      forceUpdate,
      mutationService,
      object,
      realm,
      scopedFavoriteScopeId,
    ]
  );

  const toggleFavorite = useCallback(() => {
    setFavorite(!isFavorited);
  }, [isFavorited, setFavorite]);

  return {
    isFavorited,
    isUsingScopedFavorite,
    setFavorite,
    toggleFavorite,
  };
}

function errorCode(error: unknown) {
  return error instanceof Error ? error.name : 'unknown_error';
}
