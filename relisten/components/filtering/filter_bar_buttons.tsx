import { MaterialCommunityIcons } from '@expo/vector-icons';
import driver from '@switz/driver';
import { PropsWithChildren } from 'react';
import { Pressable, PressableProps, View } from 'react-native';
import { RelistenText } from '../relisten_text';
import { FilterControl, SortDirection } from './filters';
import { tw } from '@/relisten/util/tw';

export const FilterBarButton = <K extends string>({
  filter,
  className,
  color,
  size,
  children,
  onPress,
  ...props
}: PropsWithChildren<
  {
    filter: FilterControl<K>;
    size?: number;
    color?: string;
  } & PressableProps
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
    <Pressable
      className={tw(
        'mr-3 flex flex-row items-center rounded-lg border p-1 px-2',
        filter.active ? 'border-transparent bg-relisten-blue-600' : 'border-relisten-blue-600/30',
        className
      )}
      style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
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
      <RelistenText className="text-base font-bold">
        {filter.title ? filter.title : children}
      </RelistenText>
    </Pressable>
  );
};

export function FilterBarButtons<K extends string>({
  filters,
  onFilterButtonPress,
}: {
  filters: ReadonlyArray<FilterControl<K>>;
  onFilterButtonPress: (filter: FilterControl<K>) => void;
}) {
  return (
    <>
      {filters
        .filter((f) => !f.hasSearchFilter)
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
