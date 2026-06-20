import { StyleSheet, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import React from 'react';
import { FavoritableObject } from '../realm/favoritable_object';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCatalogFavoriteState } from '@/relisten/user_library/favorite_state_hooks';

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

export const FavoriteObjectButton = <T extends FavoritableObject & { uuid: string }>({
  object,
  ...props
}: { object: T } & TouchableOpacityProps) => {
  const { isFavorited, toggleFavorite } = useCatalogFavoriteState(object);

  return <FavoriteIconButton isFavorited={isFavorited} onPressOut={toggleFavorite} {...props} />;
};
