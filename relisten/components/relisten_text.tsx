import React, { PropsWithChildren } from 'react';
import { Platform, StyleProp, Text, TextProps, TextStyle } from 'react-native';
import { tw } from '../util/tw';
import { useIsDesktopLayout } from '@/relisten/util/layout';

export const RelistenText: React.FC<PropsWithChildren<TextProps> & { cn?: string }> = ({
  children,
  cn,
  className,
  ...props
}) => {
  const isDesktopLayout = useIsDesktopLayout();
  const fontProps: StyleProp<TextStyle> = {};

  if (Platform.OS === 'android') {
    fontProps['fontFamily'] = 'Roboto';
  }

  return (
    <Text
      className={tw(
        isDesktopLayout ? 'text-lg' : 'text-base',
        'tabular-nums text-white',
        cn,
        className
      )}
      selectable={true}
      {...props}
    >
      {/* TODO: find a way to solve tabular nums with only 1 text component */}
      <Text style={{ fontVariant: ['tabular-nums'], ...fontProps }}>{children}</Text>
    </Text>
  );
};
