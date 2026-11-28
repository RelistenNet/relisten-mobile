import React, { PropsWithChildren } from 'react';
import { TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { tw } from '@/relisten/util/tw';

/** A list row's touchable props; `cn` adds classes to its padding and width. */
export type SectionedListItemProps = PropsWithChildren<TouchableOpacityProps> & { cn?: string };

export type TouchableOpacityRef = React.ElementRef<typeof TouchableOpacity>;

export const SectionedListItem = React.forwardRef<TouchableOpacityRef, SectionedListItemProps>(
  ({ children, cn, ...props }, ref) => {
    return (
      <TouchableOpacity ref={ref} className={tw('flex w-full px-4 py-2', cn)} {...props}>
        {children}
      </TouchableOpacity>
    );
  }
);

SectionedListItem.displayName = 'SectionedListItem';
