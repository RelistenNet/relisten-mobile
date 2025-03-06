import { View, ViewProps } from 'react-native';
import React, { PropsWithChildren } from 'react';
import { RelistenText } from './relisten_text';
import { tw } from '@/relisten/util/tw';

export const SectionHeader: React.FC<PropsWithChildren<{ title?: string } & ViewProps>> = ({
  title,
  className,
  children,
  ...props
}) => {
  let inner = children;

  if (title) {
    inner = <RelistenText className="text-m font-bold">{title}</RelistenText>;
  }

  return (
    <View className={tw('flex bg-relisten-blue-800 px-4 py-2', className)} {...props}>
      {inner}
    </View>
  );
};
