import { TouchableOpacity, TouchableOpacityProps } from 'react-native';
import React, { PropsWithChildren } from 'react';
import clsx from 'clsx';

export const SectionedListItem: React.FC<PropsWithChildren<TouchableOpacityProps>> = ({
  children,
  className,
  ...props
}) => {
  return (
    <TouchableOpacity className={clsx('flex w-full px-4 py-2', className)} {...props}>
      {children}
    </TouchableOpacity>
  );
};
