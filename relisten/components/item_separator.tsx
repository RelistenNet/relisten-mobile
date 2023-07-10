import { View, ViewProps } from 'react-native';
import React from 'react';
import clsx from 'clsx';

export const ItemSeparator: React.FC = ({ className, ...props }: ViewProps) => {
  return <View className={clsx('h-[0.5] w-full bg-relisten-blue-800', className)} {...props} />;
};
