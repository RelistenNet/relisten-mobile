import React, { PropsWithChildren } from 'react';
import { Text, TextProps } from 'react-native';
import clsx from 'clsx';

export const RelistenText: React.FC<PropsWithChildren<TextProps>> = ({ children, ...props }) => {
  return (
    <Text className={clsx('text-base text-white', props.className)} selectable={true} {...props}>
      {children}
    </Text>
  );
};
