import { StyleSheet } from 'react-native';
import React, { PropsWithChildren } from 'react';
import { Text, TextProps } from 'react-native-ui-lib';

const styles = StyleSheet.create({
  text: {
    fontSize: 16,
  },
});

export const RelistenText: React.FC<PropsWithChildren<TextProps>> = ({ children, ...props }) => {
  return (
    <Text style={[styles.text, props.style]} {...props}>
      {children}
    </Text>
  );
};
