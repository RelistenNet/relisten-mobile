import React, { PropsWithChildren } from 'react';
import { TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { tw } from '@/relisten/util/tw';

type Props = PropsWithChildren<TouchableOpacityProps> & { cn?: string };

export const SectionedListItem = React.forwardRef<any, Props>(({ children, cn, ...props }, ref) => {
  return (
    <TouchableOpacity ref={ref} className={tw('flex w-full px-4 py-2', cn)} {...props}>
      {children}
    </TouchableOpacity>
  );
});

SectionedListItem.displayName = 'SectionedListItem';
