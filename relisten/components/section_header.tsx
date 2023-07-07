import { StyleSheet, View } from 'react-native';
import React, { PropsWithChildren } from 'react';
import { RelistenText } from './relisten_text';

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    display: 'flex',
    justifyContent: 'center',
    backgroundColor: '#eee',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  text: {
    fontWeight: 'bold',
    fontSize: 14,
  },
});

export const SectionHeader: React.FC<PropsWithChildren<{ title?: string }>> = ({
  title,
  children,
}) => {
  let inner = children;

  if (title) {
    inner = <RelistenText style={styles.text}>{title}</RelistenText>;
  }

  return <View style={styles.container}>{inner}</View>;
};
