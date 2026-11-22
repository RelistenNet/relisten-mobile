import React, { PropsWithChildren } from 'react';
import { Text, TextProps } from 'react-native';
import { tw } from '../util/tw';

export const RelistenText: React.FC<PropsWithChildren<TextProps> & { cn?: string }> = ({
  children,
  cn,
  className,
  ...props
}) => {
  // Not selectable unless a screen opts in where copying is useful (taper
  // notes, reviews, error details). Android also ignores `numberOfLines` on
  // selectable text, so a truncated title would wrap and clip instead.
  return (
    <Text
      className={tw('text-base tabular-nums text-white', cn, className)}
      selectable={false}
      {...props}
    >
      {/* TODO: find a way to solve tabular nums with only 1 text component */}
      <Text style={{ fontVariant: ['tabular-nums'] }}>{children}</Text>
    </Text>
  );
};
