import { MaterialCommunityIcons } from '@expo/vector-icons';
import driver from '@switz/driver';
import clsx from 'clsx';
import React, { PropsWithChildren } from 'react';
import { TouchableOpacity, TouchableOpacityProps, View } from 'react-native';
import { RelistenObject } from '../../api/models/relisten';
import { RelistenText } from '../relisten_text';
import { Filter, SortDirection } from './filters';

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
  const filterIcon = driver({
    states: {
      isNumericAscending: filter.isNumeric && filter.sortDirection === SortDirection.Ascending,
      isNumericDescending: filter.isNumeric && filter.sortDirection === SortDirection.Descending,
      isAlphabeticalAscending: filter.sortDirection === SortDirection.Ascending,
      isAlphabeticalDescending: filter.sortDirection === SortDirection.Descending,
      isFilterActive: !filter.sortDirection && filter.active,
      isFilterInactive: !filter.sortDirection && !filter.active,
      fallback: true,
    },
    derived: {
      icon: {
        isNumericAscending: 'sort-numeric-ascending' as const,
        isNumericDescending: 'sort-numeric-descending' as const,
        isAlphabeticalAscending: 'sort-alphabetical-ascending' as const,
        isAlphabeticalDescending: 'sort-alphabetical-descending' as const,
        isFilterActive: 'check-circle' as const,
        isFilterInactive: 'check-circle-outline' as const,
        fallback: 'sort-descending' as const,
      },
    },
  });

  return (
    <TouchableOpacity
      className={clsx(
        'flex flex-row items-center rounded-xl p-1 px-2',
        filter.active ? 'bg-relisten-blue-600' : 'bg-relisten-blue-800',
        className
      )}
      {...props}
    >
      <MaterialCommunityIcons name={filterIcon.icon} color={color || 'white'} size={size || 16} />
      <View className="w-1" />
      <RelistenText className="text-base font-bold">
        {filter.title ? filter.title : children}
      </RelistenText>
    </TouchableOpacity>
  );
};
