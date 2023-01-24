import React, { PropsWithChildren } from 'react';
import { Text, TextProps } from 'react-native-ui-lib';

export const RelistenText: React.FC<PropsWithChildren<TextProps>> = ({ children, ...props }) => {
  return (
    <Text className="text-base" style={[props.style]} {...props}>
      {children}
    </Text>
  );
};
