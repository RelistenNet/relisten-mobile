import { MaterialCommunityIcons } from '@expo/vector-icons';
import driver from '@switz/driver';
import clsx from 'clsx';
import { PropsWithChildren } from 'react';
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
      isFilterActive: !filter.sortDirection && filter.active,
      isFilterInactive: !filter.sortDirection && !filter.active,
      isSortFilterInactive: !filter.active,
      isNumericAscending: filter.isNumeric && filter.sortDirection === SortDirection.Ascending,
      isNumericDescending: filter.isNumeric && filter.sortDirection === SortDirection.Descending,
      isAlphabeticalAscending: filter.sortDirection === SortDirection.Ascending,
      isAlphabeticalDescending: filter.sortDirection === SortDirection.Descending,

      fallback: true,
    },
    derived: {
      icon: {
        isNumericAscending: 'sort-ascending' as const,
        isNumericDescending: 'sort-descending' as const,
        isAlphabeticalAscending: 'sort-ascending' as const,
        isAlphabeticalDescending: 'sort-alphabetical-descending' as const,
        isFilterActive: '' as const,
        isFilterInactive: '' as const,
        fallback: 'sort-descending' as const,
      },
    },
  });

  return (
    <TouchableOpacity
      className={clsx(
        'flex flex-row items-center rounded-lg p-1 px-2',
        filter.active
          ? 'border border-transparent bg-relisten-blue-600'
          : 'border border-relisten-blue-600/30',
        className
      )}
      {...props}
    >
      {filterIcon.icon && (
        <>
          <MaterialCommunityIcons
            name={filterIcon.icon}
            color={color || 'white'}
            size={size || 16}
          />
          <View className="w-1" />
        </>
      )}
      <RelistenText className="text-base font-bold">
        {filter.title ? filter.title : children}
      </RelistenText>
    </TouchableOpacity>
  );
};
