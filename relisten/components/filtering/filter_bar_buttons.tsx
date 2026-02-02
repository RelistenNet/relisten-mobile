import { MaterialCommunityIcons } from '@expo/vector-icons';
import driver from '@switz/driver';
import { PropsWithChildren } from 'react';
import { TouchableOpacity, TouchableOpacityProps, View } from 'react-native';
import { RelistenObject } from '../../api/models/relisten';
import { RelistenText } from '../relisten_text';
import { Filter, SortDirection } from './filters';
import { tw } from '@/relisten/util/tw';
import { useIsDesktopLayout } from '@/relisten/util/layout';

export const FilterBarButton = <K extends string, T extends RelistenObject>({
  filter,
  className,
  color,
  size,
  children,
  onPress,
  ...props
}: PropsWithChildren<
  {
    filter: Filter<K, T>;
    size?: number;
    color?: string;
  } & TouchableOpacityProps
>) => {
  const isDesktopLayout = useIsDesktopLayout();
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
      className={tw(
        'mr-3 flex flex-row items-center rounded-lg',
        isDesktopLayout ? 'px-3 py-2' : 'p-1 px-2',
        filter.active
          ? 'border border-transparent bg-relisten-blue-600'
          : 'border border-relisten-blue-600/30',
        className
      )}
      onPress={(e) => {
        if (onPress) {
          onPress(e);
        }
      }}
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
      <RelistenText className={tw(isDesktopLayout ? 'text-lg' : 'text-base', 'font-bold')}>
        {filter.title ? filter.title : children}
      </RelistenText>
    </TouchableOpacity>
  );
};

export function FilterBarButtons<K extends string, T extends RelistenObject>({
  filters,
  onFilterButtonPress,
}: {
  filters: ReadonlyArray<Filter<K, T>>;
  onFilterButtonPress: (filter: Filter<K, T>) => void;
}) {
  return (
    <>
      {filters
        .filter((f) => !f.searchFilter)
        .map((f) => {
          return (
            <FilterBarButton
              key={f.persistenceKey}
              filter={f}
              onPress={() => onFilterButtonPress(f)}
            />
          );
        })}
    </>
  );
}
