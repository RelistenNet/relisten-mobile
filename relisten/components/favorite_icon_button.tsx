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
import type { FavoriteCatalogType } from '@/relisten/realm/models/library';
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

export const FavoriteObjectButton = <T extends { uuid: string }>({
  object,
  catalogType,
  onPress,
  ...props
}: { object: T; catalogType?: FavoriteCatalogType } & TouchableOpacityProps) => {
  const resolvedCatalogType = catalogType ?? catalogTypeForObject(object);
  const favorite = useFavorite(resolvedCatalogType, object.uuid);

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

const CATALOG_TYPE_BY_MODEL_NAME: Record<string, FavoriteCatalogType> = {
  Artist: 'artist',
  Show: 'show',
  Source: 'source',
  SourceTrack: 'source_track',
  Song: 'song',
  Tour: 'tour',
  Venue: 'venue',
};

function catalogTypeForObject(object: { constructor: unknown }) {
  const constructor = object.constructor as { name?: string; schema?: { name?: string } };
  const modelName = constructor.schema?.name ?? constructor.name ?? '';
  const catalogType = CATALOG_TYPE_BY_MODEL_NAME[modelName];
  if (!catalogType) {
    throw new Error(`FavoriteObjectButton does not support Realm model ${modelName}.`);
  }
  return catalogType;
}
