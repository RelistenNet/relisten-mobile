import { StyleSheet, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import React, { PropsWithChildren } from 'react';

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 8,
    height: 'auto',
    flex: 1,
  },
});

export const SectionedListItem: React.FC<PropsWithChildren<TouchableOpacityProps>> = ({
  children,
  ...props
}) => {
  return (
    <TouchableOpacity style={[styles.container, props.style]} {...props}>
      {children}
    </TouchableOpacity>
  );
};
