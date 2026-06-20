import { LayoutAnimation, StyleSheet, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import React, { useCallback, useMemo } from 'react';
import { FavoritableObject } from '../realm/favoritable_object';
import { DefaultLayoutAnimationConfig } from '../layout_animation_config';
import { useObject, useQuery, useRealm } from '../realm/schema';
import { useForceUpdate } from '../util/forced_update';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import { log } from '@/relisten/util/logging';

const logger = log.extend('favorite');

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    display: 'flex',
    justifyContent: 'center',
    padding: 4,
    paddingRight: 0,
  },
  text: {
    fontWeight: 'bold',
    fontSize: 24,
    color: '#f73d2f',
  },
});

function toggleFavoriteObject<T extends FavoritableObject>(
  realm: ReturnType<typeof useRealm>,
  object: T,
  forceUpdate: () => void
) {
  LayoutAnimation.configureNext(DefaultLayoutAnimationConfig);
  realm.write(() => {
    object.isFavorite = !object.isFavorite;
    forceUpdate();
  });
}

export const FavoriteIconButton: React.FC<{ isFavorited: boolean } & TouchableOpacityProps> = ({
  isFavorited,
  ...props
}) => {
  return (
    <TouchableOpacity style={styles.container} {...props}>
      <MaterialCommunityIcons
        name={isFavorited ? 'cards-heart' : 'cards-heart-outline'}
        size={18}
        color={isFavorited ? '#dc2625' : '#93a1b8'}
      />
    </TouchableOpacity>
  );
};

export const FavoriteObjectButton = <T extends FavoritableObject & { uuid: string }>({
  object,
  ...props
}: { object: T } & TouchableOpacityProps) => {
  const realm = useRealm();
  const forceUpdate = useForceUpdate();
  const activeScope = useObject(ActiveUserDataScope, ACTIVE_USER_DATA_SCOPE_KEY, [
    'scopeId',
    'scopeKind',
  ]);
  const favoriteDescriptor = useMemo(() => catalogFavoriteDescriptorForObject(object), [object]);
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
  const isFavorited = isUsingScopedFavorite
    ? isActiveFavoriteRow(activeScopedFavorites[0])
    : object.isFavorite;

  const favoriteOnPress = useCallback(() => {
    if (!scopedFavoriteScopeId || !favoriteEntityType || !favoriteEntityUuid) {
      toggleFavoriteObject(realm, object, forceUpdate);
      return;
    }

    LayoutAnimation.configureNext(DefaultLayoutAnimationConfig);
    void mutationService
      .setFavorite(scopedFavoriteScopeId, favoriteEntityType, favoriteEntityUuid, !isFavorited)
      .catch((error) => {
        logger.warn(`favorite mutation failed: ${errorCode(error)}`);
      });
  }, [
    favoriteEntityType,
    favoriteEntityUuid,
    forceUpdate,
    isFavorited,
    mutationService,
    object,
    realm,
    scopedFavoriteScopeId,
  ]);

  return <FavoriteIconButton isFavorited={isFavorited} onPressOut={favoriteOnPress} {...props} />;
};

function errorCode(error: unknown) {
  return error instanceof Error ? error.name : 'unknown_error';
}
