import { LayoutAnimation, StyleSheet, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import React, { useCallback } from 'react';
import { FavoritableObject } from '../realm/favoritable_object';
import { DefaultLayoutAnimationConfig } from '../layout_animation_config';
import { useRealm } from '../realm/schema';
import { useForceUpdate } from '../util/forced_update';
import { MaterialCommunityIcons } from '@expo/vector-icons';

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
        /* color-red/slate-600 */ color={isFavorited ? '#dc2625' : '#93a1b8'}
      />
    </TouchableOpacity>
  );
};

export const FavoriteObjectButton = <T extends FavoritableObject>({
  object,
  ...props
}: { object: T } & TouchableOpacityProps) => {
  const realm = useRealm();
  const forceUpdate = useForceUpdate();

  const favoriteOnPress = useCallback(() => {
    LayoutAnimation.configureNext(DefaultLayoutAnimationConfig);
    realm.write(() => {
      object.isFavorite = !object.isFavorite;
      forceUpdate();
    });
  }, [object, forceUpdate]);

  return (
    <FavoriteIconButton isFavorited={object.isFavorite} onPress={favoriteOnPress} {...props} />
  );
};
