import { LayoutAnimation, StyleSheet, Text, TouchableOpacity } from 'react-native';
import React, { useCallback } from 'react';
import clsx from 'clsx';
import { FavoritableObject } from '../realm/favoritable_object';
import { DefaultLayoutAnimationConfig } from '../layout_animation_config';
import { useRealm } from '../realm/schema';
import { useForceUpdate } from '../util/forced_update';

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    display: 'flex',
    justifyContent: 'center',
  },
  text: {
    fontWeight: 'bold',
    fontSize: 24,
    color: '#f73d2f',
  },
});

export const FavoriteIconButton: React.FC<{ isFavorited: boolean; onPress: () => void }> = ({
  isFavorited,
  onPress,
}) => {
  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <Text
        className={clsx('color-gray-400 text-2xl font-bold', {
          ['color-red-600']: isFavorited,
        })}
      >
        {isFavorited ? '♥' : '♡'}
      </Text>
    </TouchableOpacity>
  );
};

export const FavoriteObjectButton = <T extends FavoritableObject>({ object }: { object: T }) => {
  const realm = useRealm();
  const forceUpdate = useForceUpdate();

  const favoriteOnPress = useCallback(() => {
    LayoutAnimation.configureNext(DefaultLayoutAnimationConfig);
    realm.write(() => {
      object.isFavorite = !object.isFavorite;
      forceUpdate();
    });
  }, [object, forceUpdate]);

  return <FavoriteIconButton isFavorited={object.isFavorite} onPress={favoriteOnPress} />;
};
