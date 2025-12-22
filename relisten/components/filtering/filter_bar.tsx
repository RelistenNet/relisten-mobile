import { LegacyRef, PropsWithChildren, useEffect, useRef, useState } from 'react';
import { ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { FilterBarButtons } from '@/relisten/components/filtering/filter_bar_buttons';
import { RelistenObject } from '@/relisten/api/models/relisten';
import { Filter, useFilters } from '@/relisten/components/filtering/filters';
import { MaterialIcons } from '@expo/vector-icons';

export function NonSearchFilterBar<K extends string, T extends RelistenObject>({
  children,
  filters,
  onFilterButtonPress,
  enterSearch,
}: PropsWithChildren & {
  filters: ReadonlyArray<Filter<K, T>>;
  onFilterButtonPress: (filter: Filter<K, T>) => void;
  enterSearch: () => void;
}) {
  const hasSearch = filters.filter((f) => !!f.searchFilter).length > 0;

  return (
    <View className="flex min-h-[56px] w-full flex-row items-center space-x-3 px-4 py-3">
      {hasSearch && (
        <TouchableOpacity className="pr-3 pt-1" onPress={enterSearch}>
          <MaterialIcons name="search" color="white" size={24} />
        </TouchableOpacity>
      )}
      {children}
      <FilterBarButtons filters={filters} onFilterButtonPress={onFilterButtonPress} />
    </View>
  );
}

export function SearchFilterBar({
  search,
  exitSearch,
  innerRef,
  searchText,
}: {
  search: (input: string) => void;
  exitSearch: () => void;
  innerRef: LegacyRef<TextInput>;
  searchText?: string;
}) {
  const onChangeText = (input: string) => {
    search(input);
  };

  return (
    <View className="min-h-[56px] w-full flex-1 flex-row items-center justify-between px-4 py-2">
      <View className="flex-grow">
        <TextInput
          className="rounded-lg border border-relisten-blue-600/30 p-2 px-2 text-lg text-white"
          placeholder="Search"
          placeholderTextColor="lightgray"
          onChangeText={onChangeText}
          value={searchText}
          ref={innerRef}
        />
      </View>
      <TouchableOpacity className="flex-shrink py-1 pl-2" onPress={exitSearch}>
        <MaterialIcons name="cancel" color="white" size={24} />
      </TouchableOpacity>
    </View>
  );
}

export function FilterBar<K extends string, T extends RelistenObject>({
  children,
}: PropsWithChildren) {
  const { filters, onFilterButtonPress, onSearchTextChanged, searchText } = useFilters<K, T>();
  const [isTextFiltering, setIsTextFiltering] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (isTextFiltering) {
      searchInputRef.current?.focus();
    }
  }, [searchInputRef, isTextFiltering]);

  return (
    <>
      {isTextFiltering ? (
        <SearchFilterBar
          search={onSearchTextChanged}
          exitSearch={() => {
            onSearchTextChanged(undefined);
            setIsTextFiltering(false);
          }}
          searchText={searchText}
          innerRef={searchInputRef}
        />
      ) : (
        <ScrollView horizontal className="w-full" keyboardShouldPersistTaps="handled">
          <NonSearchFilterBar
            filters={filters}
            onFilterButtonPress={onFilterButtonPress}
            enterSearch={() => setIsTextFiltering(true)}
          >
            {children}
          </NonSearchFilterBar>
        </ScrollView>
      )}
    </>
  );
}
