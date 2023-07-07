import { StyleSheet, View } from 'react-native';
import React from 'react';

const styles = StyleSheet.create({
  container: {
    height: 0.5,
    width: '100%',
    backgroundColor: '#d8d8d8',
  },
});

export const ItemSeparator: React.FC = () => {
  return <View style={styles.container} />;
};
