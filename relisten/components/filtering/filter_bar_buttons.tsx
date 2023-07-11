import React, { PropsWithChildren } from 'react';
import { TouchableOpacity, TouchableOpacityProps, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RelistenText } from '../relisten_text';
import clsx from 'clsx';
import { Filter, SortDirection } from './filters';
import { RelistenObject } from '../../api/models/relisten';

export const FilterBarButton = <T extends RelistenObject>({
  filter,
  className,
  color,
  size,
  children,
  ...props
}: PropsWithChildren<
  {
    filter: Filter<T>;
    size?: number;
    color?: string;
  } & TouchableOpacityProps
>) => {
  let icon: keyof typeof MaterialCommunityIcons.glyphMap = 'sort-descending';

  if (filter.sortDirection === undefined) {
    icon = filter.active ? 'check-circle' : 'check-circle-outline';
  } else {
    if (filter.isNumeric) {
      if (filter.sortDirection === SortDirection.Ascending) {
        icon = 'sort-numeric-ascending';
      } else {
        icon = 'sort-numeric-descending';
      }
    } else {
      if (filter.sortDirection === SortDirection.Ascending) {
        icon = 'sort-alphabetical-ascending';
      } else {
        icon = 'sort-alphabetical-descending';
      }
    }
  }

  return (
    <TouchableOpacity
      className={clsx(
        'flex flex-row items-center rounded-xl p-1 px-2',
        filter.active ? 'bg-relisten-blue-600' : 'bg-relisten-blue-800',
        className
      )}
      {...props}
    >
      <MaterialCommunityIcons name={icon} color={color || 'white'} size={size || 16} />
      <View className="w-[4]" />
      <RelistenText className="text-base font-bold">
        {filter.title ? filter.title : children}
      </RelistenText>
    </TouchableOpacity>
  );
};
