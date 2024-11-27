import { View, ViewProps } from 'react-native';
import React from 'react';
import { tw } from '@/relisten/util/tw';

export const ItemSeparator: React.FC = ({ className, ...props }: ViewProps) => {
  return <View className={tw('h-[0.5] w-full bg-relisten-blue-800', className)} {...props} />;
};
