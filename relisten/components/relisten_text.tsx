import React, { PropsWithChildren } from 'react';
import { Text, TextProps } from 'react-native';
import { tw } from '../util/tw';

export const RelistenText: React.FC<PropsWithChildren<TextProps> & { cn?: string }> = ({
  children,
  cn,
  ...props
}) => {
  return (
    <Text className={tw('text-base tabular-nums text-white', cn)} selectable={true} {...props}>
      {/* TODO: find a way to solve tabular nums with only 1 text component */}
      <Text style={{ fontVariant: ['tabular-nums'] }}>{children}</Text>
    </Text>
  );
};
