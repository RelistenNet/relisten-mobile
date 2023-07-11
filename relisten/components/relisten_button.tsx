import { TouchableOpacity, TouchableOpacityProps, View } from 'react-native';
import clsx from 'clsx';
import { RelistenText } from './relisten_text';
import React from 'react';

export const RelistenButton = ({
  children,
  className,
  icon,
  textClassName,
  ...props
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  textClassName?: string;
  className?: string;
} & TouchableOpacityProps) => {
  return (
    <TouchableOpacity
      className={clsx(
        'flex-row items-center justify-center rounded bg-relisten-blue-800 p-4',
        className
      )}
      {...props}
    >
      {icon && <View className="pr-1">{icon}</View>}
      <RelistenText className={clsx('text-center font-bold', textClassName)}>
        {children}
      </RelistenText>
    </TouchableOpacity>
  );
};
