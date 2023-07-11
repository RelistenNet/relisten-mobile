import React, { PropsWithChildren } from 'react';
import { Text, TextProps } from 'react-native';
import clsx from 'clsx';

export const RelistenText: React.FC<PropsWithChildren<TextProps> & { cn?: string }> = ({
  children,
  cn,
  ...props
}) => {
  return (
    <Text className={clsx('text-base text-white', cn)} selectable={true} {...props}>
      {children}
    </Text>
  );
};
