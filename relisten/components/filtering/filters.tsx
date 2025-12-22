import { RouteFilterConfig, serializeFilters } from '@/relisten/realm/models/route_filter_config';
import { useObject, useRealm } from '@/relisten/realm/schema';
import React, {
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import Realm from 'realm';
import { RelistenObject } from '../../api/models/relisten';

const GLOBAL_FILTER_KEY = '__global__';

export enum SortDirection {
  UNKNOWN = 0,
  Ascending,
  Descending,
}

export interface PersistedFilter<K extends string> {
  persistenceKey: K;
  active: boolean;
  sortDirection?: SortDirection;
  isGlobal?: boolean;
}

export interface Filter<K extends string, T> extends PersistedFilter<K> {
  isNumeric?: boolean;
  title: string;

  // You must provide one of the two
  sort?: (data: T[]) => void;
  filter?: (data: T) => boolean;
  searchFilter?: (data: T, searchText: string) => boolean;

  realmFilter?: (data: Realm.Results<T>) => Realm.Results<T>;
}

export interface FilteringOptions<K extends string> {
  persistence?: { key: string };
  default?: { persistenceKey: K; active: boolean; sortDirection?: SortDirection };
}

export interface FilteringContextProps<K extends string, T extends RelistenObject> {
  filters: ReadonlyArray<Filter<K, T>>;
  onFilterButtonPress: (filter: Filter<K, T>) => void;
  filter: (allData: ReadonlyArray<T>, textFilter?: string) => ReadonlyArray<T>;
  onSearchTextChanged: (text?: string) => void;
  clearFilters: () => void;
  searchText?: string;
}

export const FilteringContext = React.createContext<
  FilteringContextProps<string, RelistenObject> | undefined
>(undefined);

export const FilteringProvider = <K extends string, T extends RelistenObject>({
  children,
  filters,
  options,
}: PropsWithChildren<{ filters: ReadonlyArray<Filter<K, T>>; options?: FilteringOptions<K> }>) => {
  const isInitialRender = useRef(true);
  const realm = useRealm();
  const [textFilter, setTextFilter] = useState<string | undefined>(undefined);

  const filterPersistenceKey = options?.persistence?.key;

  let routeFilterConfig = useObject(RouteFilterConfig, filterPersistenceKey || '__no_object__');
  let globalFilterConfig = useObject(RouteFilterConfig, GLOBAL_FILTER_KEY);

  const routePersistedFilters = routeFilterConfig ? routeFilterConfig.filters() : undefined;
  const globalPersistedFilters = globalFilterConfig ? globalFilterConfig.filters() : undefined;

  const preparedFilters = useMemo(() => {
    if (!routePersistedFilters) return [...filters];

    const internalFilters = filters.map((f) => {
      return { ...f };
    });

    // this only runs on the initial render pass
    if (isInitialRender.current) {
      for (const filter of internalFilters) {
        if (filter) {
          if (options?.default && options.default.persistenceKey === filter.persistenceKey) {
            filter.active = options.default.active;
            filter.sortDirection = options.default.sortDirection;
          } else {
            filter.active = false;
          }
        }
      }

      isInitialRender.current = false;
    }

    // this runs on every render pass (assuming filters/data changes)
    for (const internalFilter of internalFilters) {
      if (internalFilter) {
        const key = internalFilter.persistenceKey;
        const persistedFilter =
          internalFilter.isGlobal && globalPersistedFilters
            ? globalPersistedFilters[key]
            : routePersistedFilters[key];
        if (persistedFilter) {
          internalFilter.active = persistedFilter.active;
          internalFilter.sortDirection = persistedFilter.sortDirection;
        } else {
          internalFilter.active = false;
        }
      }
    }

    return [...internalFilters];
  }, [routePersistedFilters, globalPersistedFilters]);

  const filter = useCallback(
    (allData: ReadonlyArray<T>, textFilter?: string) => {
      const filteredData: T[] = [];

      for (const row of allData) {
        let allowed = true;

        for (const filter of preparedFilters) {
          if (filter.active && filter.filter && !filter.filter(row)) {
            allowed = false;
            break;
          } else if (filter.searchFilter && textFilter && !filter.searchFilter(row, textFilter)) {
            allowed = false;
            break;
          }
        }

        if (allowed) {
          filteredData.push(row);
        }
      }

      for (const filter of preparedFilters) {
        if (filter.active && filter.sort) {
          filter.sort(filteredData);

          if (filter.sortDirection === SortDirection.Descending) {
            filteredData.reverse();
          }

          break;
        }
      }

      return filteredData;
    },
    [preparedFilters]
  );

  const onFilterButtonPress = useCallback(
    (thisFilter: Filter<K, T>) => {
      /*
    - multiple thisFilters can be active at the same time
    - thisFilters can be active at the same time as sorting
    - only 1 thing can sort at a time
    - there's always 1 sort active at any time
     */

      const intermediateFilters = preparedFilters.map((f) => {
        return { ...f };
      });
      const changingFilter = intermediateFilters.find(
        (f) => f.persistenceKey === thisFilter.persistenceKey
      );

      if (changingFilter) {
        if (changingFilter.sortDirection !== undefined) {
          // disable other sorts
          for (const f of intermediateFilters) {
            if (f !== changingFilter && f.sortDirection !== undefined) {
              f.active = false;
            }
          }

          if (changingFilter.active) {
            // if already active, flip the direction
            if (changingFilter.sortDirection === SortDirection.Ascending) {
              changingFilter.sortDirection = SortDirection.Descending;
            } else if (changingFilter.sortDirection === SortDirection.Descending) {
              changingFilter.sortDirection = SortDirection.Ascending;
            }
          } else {
            // otherwise, just activate the changingFilter
            changingFilter.active = true;
          }
        } else {
          changingFilter.active = !changingFilter.active;
        }
      }

      realm.write(() => {
        if (filterPersistenceKey) {
          const globalFilters = intermediateFilters.filter((f) => f.isGlobal);
          const localFilters = intermediateFilters.filter((f) => !f.isGlobal);

          if (routeFilterConfig) {
            routeFilterConfig.setFilters(localFilters);
          } else {
            routeFilterConfig = realm.create(RouteFilterConfig, {
              key: filterPersistenceKey,
              rawFilters: serializeFilters(localFilters),
            });
          }
          if (globalFilterConfig) {
            globalFilterConfig.setFilters(globalFilters);
          } else {
            globalFilterConfig = realm.create(RouteFilterConfig, {
              key: GLOBAL_FILTER_KEY,
              rawFilters: serializeFilters(globalFilters),
            });
          }
        }
      });
    },
    [preparedFilters, realm, filterPersistenceKey, options]
  );

  const clearFilters = () => {
    setTextFilter('');
    realm.write(() => {
      if (filterPersistenceKey) {
        const globalFilters = preparedFilters.filter((f) => f.isGlobal);
        const localFilters = preparedFilters.filter((f) => !f.isGlobal);

        // clear filters that are not "sorts"
        globalFilters.forEach((f) => f.sortDirection === undefined && (f.active = false));
        localFilters.forEach((f) => f.sortDirection === undefined && (f.active = false));

        if (routeFilterConfig) {
          routeFilterConfig.setFilters(localFilters);
        } else {
          routeFilterConfig = realm.create(RouteFilterConfig, {
            key: filterPersistenceKey,
            rawFilters: serializeFilters(localFilters),
          });
        }
        if (globalFilterConfig) {
          globalFilterConfig.setFilters(globalFilters);
        } else {
          globalFilterConfig = realm.create(RouteFilterConfig, {
            key: GLOBAL_FILTER_KEY,
            rawFilters: serializeFilters(globalFilters),
          });
        }
      }
    });
  };

  return (
    <FilteringContext.Provider
      value={{
        filters: preparedFilters,
        onFilterButtonPress,
        filter,
        clearFilters,
        onSearchTextChanged: setTextFilter,
        searchText: textFilter,
      }}
    >
      {children}
    </FilteringContext.Provider>
  );
};

export function searchForSubstring(haystack: string | undefined, lowercaseNeedle: string): boolean {
  if (!haystack) {
    return false;
  }

  return haystack.toLowerCase().indexOf(lowercaseNeedle) > -1;
}

export const useFilters = <K extends string, T extends RelistenObject>() => {
  const context = useContext(FilteringContext);

  if (context === undefined) {
    throw new Error('useFilters must be used within a FilteringProvider');
  }

  return context as FilteringContextProps<K, T>;
};
