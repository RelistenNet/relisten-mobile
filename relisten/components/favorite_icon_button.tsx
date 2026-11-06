import type { FavoriteCatalogTarget } from '@/relisten/library/favorite_catalog_target';
import {
  type GestureResponderEvent,
  LayoutAnimation,
  StyleSheet,
  TouchableOpacity,
  TouchableOpacityProps,
} from 'react-native';
import React, { useCallback } from 'react';
import { DefaultLayoutAnimationConfig } from '../layout_animation_config';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { FavoriteTargetKind } from '@/relisten/realm/models/library/favorite_catalog_type';
import { useFavorite } from '@/relisten/library/favorite_hooks';

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

export const FavoriteTargetButton = ({
  targetKind,
  catalogId,
  onPress,
  ...props
}: FavoriteCatalogTarget & TouchableOpacityProps) => {
  const favorite = useFavorite(targetKind, catalogId);

  const favoriteOnPress = useCallback(
    (event: GestureResponderEvent) => {
      // Favorite controls usually live inside a navigable row. Keep a library
      // change from also opening that row's destination.
      event.stopPropagation();
      LayoutAnimation.configureNext(DefaultLayoutAnimationConfig);
      favorite.toggleFavorite();
      onPress?.(event);
    },
    [favorite, onPress]
  );

  return (
    <FavoriteIconButton
      accessibilityLabel={favorite.isFavorite ? 'Remove from My Library' : 'Add to My Library'}
      accessibilityRole="button"
      accessibilityState={{ selected: favorite.isFavorite }}
      hitSlop={8}
      {...props}
      isFavorited={favorite.isFavorite}
      onPress={favoriteOnPress}
    />
  );
};

export const FavoriteObjectButton = <T extends FavoriteObject>({
  object,
  targetKind,
  ...props
}: { object: T; targetKind?: FavoriteTargetKind } & TouchableOpacityProps) => {
  const target = favoriteTargetForObject(object, targetKind);
  return <FavoriteTargetButton {...props} {...target} />;
};

interface FavoriteObject {
  uuid?: string;
  id?: string;
  constructor: unknown;
}

const TARGET_KIND_BY_MODEL_NAME: Record<string, FavoriteTargetKind> = {
  Artist: 'artist',
  NormalizedSong: 'song',
  NormalizedVenue: 'venue',
  Show: 'show',
  Source: 'source',
  SourceTrack: 'track',
  Song: 'imported_song',
  Tour: 'tour',
  Venue: 'imported_venue',
};

function favoriteTargetForObject(object: FavoriteObject, explicitTargetKind?: FavoriteTargetKind) {
  const constructor = object.constructor as { name?: string; schema?: { name?: string } };
  const modelName = constructor.schema?.name ?? constructor.name ?? '';
  const targetKind = explicitTargetKind ?? TARGET_KIND_BY_MODEL_NAME[modelName];
  if (!targetKind) {
    throw new Error(`FavoriteObjectButton does not support Realm model ${modelName}.`);
  }

  const catalogId = targetKind === 'song' || targetKind === 'venue' ? object.id : object.uuid;
  if (!catalogId) {
    throw new Error(`FavoriteObjectButton could not read the ${targetKind} ID from ${modelName}.`);
  }

  return { targetKind, catalogId };
}
