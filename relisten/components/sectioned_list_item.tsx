import { StyleSheet, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import React, { PropsWithChildren } from 'react';

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    width: '100%',
    paddingHorizontal: 8,
    paddingVertical: 4,
    height: 'auto',
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
