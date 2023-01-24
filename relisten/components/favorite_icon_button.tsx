import { StyleSheet } from 'react-native';
import React from 'react';
import clsx from 'clsx';
import { Text, TouchableOpacity } from 'react-native-ui-lib';

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
        className={clsx('font-bold text-2xl color-gray-400', {
          ['color-red-600']: isFavorited,
        })}
      >
        {isFavorited ? '♥' : '♡'}
      </Text>
    </TouchableOpacity>
  );
};
