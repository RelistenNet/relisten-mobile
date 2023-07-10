import { View } from 'react-native';
import React, { PropsWithChildren } from 'react';
import { RelistenText } from './relisten_text';

export const SectionHeader: React.FC<PropsWithChildren<{ title?: string }>> = ({
  title,
  children,
}) => {
  let inner = children;

  if (title) {
    inner = <RelistenText className="text-m font-bold">{title}</RelistenText>;
  }

  return <View className="flex bg-relisten-blue-800 px-4 py-2">{inner}</View>;
};
