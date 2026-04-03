import { RouteFilterConfig, serializeFilters } from '@/relisten/realm/models/route_filter_config';
import { useObject, useRealm } from '@/relisten/realm/schema';
import React, { PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';
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
  sort?(data: T[]): void;
  filter?(data: T): boolean;
  searchFilter?(data: T, searchText: string): boolean;

  realmFilter?(data: Realm.Results<T>): Realm.Results<T>;
}

export interface FilterControl<K extends string> extends PersistedFilter<K> {
  isNumeric?: boolean;
  title: string;
  hasSearchFilter?: boolean;
}

export interface FilteringOptions<K extends string> {
  persistence?: { key: string };
  default?: { persistenceKey: K; active: boolean; sortDirection?: SortDirection };
}

export interface FilteringContextProps<K extends string, T extends RelistenObject> {
  filters: ReadonlyArray<FilterControl<K>>;
  onFilterButtonPress(filter: FilterControl<K>): void;
  filter(allData: ReadonlyArray<T>, textFilter?: string): ReadonlyArray<T>;
  onSearchTextChanged(text?: string): void;
  clearFilters(): void;
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
  const realm = useRealm();
  const [textFilter, setTextFilter] = useState<string | undefined>(undefined);

  const filterPersistenceKey = options?.persistence?.key;
  const defaultFilter = options?.default;

  const routeFilterConfig = useObject(RouteFilterConfig, filterPersistenceKey || '__no_object__');
  const globalFilterConfig = useObject(RouteFilterConfig, GLOBAL_FILTER_KEY);

  const routePersistedFilters = routeFilterConfig ? routeFilterConfig.filters() : undefined;
  const globalPersistedFilters = globalFilterConfig ? globalFilterConfig.filters() : undefined;

  const preparedFilters = useMemo(() => {
    const internalFilters = filters.map((f) => {
      if (!defaultFilter) {
        return { ...f };
      }

      if (defaultFilter.persistenceKey === f.persistenceKey) {
        return {
          ...f,
          active: defaultFilter.active,
          sortDirection: defaultFilter.sortDirection,
        };
      }

      return {
        ...f,
        active: false,
      };
    });

    // this runs on every render pass (assuming filters/data changes)
    for (const internalFilter of internalFilters) {
      if (internalFilter) {
        const key = internalFilter.persistenceKey;
        const persistedFilter =
          internalFilter.isGlobal && globalPersistedFilters
            ? globalPersistedFilters[key]
            : routePersistedFilters?.[key];
        if (persistedFilter) {
          internalFilter.active = persistedFilter.active;
          internalFilter.sortDirection = persistedFilter.sortDirection;
        }
      }
    }

    return [...internalFilters];
  }, [defaultFilter, filters, globalPersistedFilters, routePersistedFilters]);

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
    (thisFilter: FilterControl<K>) => {
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

          const nextRouteFilterConfig =
            routeFilterConfig ??
            realm.create(RouteFilterConfig, {
              key: filterPersistenceKey,
              rawFilters: serializeFilters(localFilters),
            });
          nextRouteFilterConfig.setFilters(localFilters);

          const nextGlobalFilterConfig =
            globalFilterConfig ??
            realm.create(RouteFilterConfig, {
              key: GLOBAL_FILTER_KEY,
              rawFilters: serializeFilters(globalFilters),
            });
          nextGlobalFilterConfig.setFilters(globalFilters);
        }
      });
    },
    [filterPersistenceKey, globalFilterConfig, preparedFilters, realm, routeFilterConfig]
  );

  const clearFilters = useCallback(() => {
    setTextFilter('');
    realm.write(() => {
      if (filterPersistenceKey) {
        const globalFilters = preparedFilters.filter((f) => f.isGlobal);
        const localFilters = preparedFilters.filter((f) => !f.isGlobal);

        // clear filters that are not "sorts"
        globalFilters.forEach((f) => f.sortDirection === undefined && (f.active = false));
        localFilters.forEach((f) => f.sortDirection === undefined && (f.active = false));

        const nextRouteFilterConfig =
          routeFilterConfig ??
          realm.create(RouteFilterConfig, {
            key: filterPersistenceKey,
            rawFilters: serializeFilters(localFilters),
          });
        nextRouteFilterConfig.setFilters(localFilters);

        const nextGlobalFilterConfig =
          globalFilterConfig ??
          realm.create(RouteFilterConfig, {
            key: GLOBAL_FILTER_KEY,
            rawFilters: serializeFilters(globalFilters),
          });
        nextGlobalFilterConfig.setFilters(globalFilters);
      }
    });
  }, [filterPersistenceKey, globalFilterConfig, preparedFilters, realm, routeFilterConfig]);

  const filterControls = useMemo<ReadonlyArray<FilterControl<K>>>(() => {
    return preparedFilters.map((f) => ({
      persistenceKey: f.persistenceKey,
      active: f.active,
      sortDirection: f.sortDirection,
      isGlobal: f.isGlobal,
      isNumeric: f.isNumeric,
      title: f.title,
      hasSearchFilter: !!f.searchFilter,
    }));
  }, [preparedFilters]);

  const contextValue = useMemo(
    () => ({
      filters: filterControls,
      onFilterButtonPress,
      filter,
      clearFilters,
      onSearchTextChanged: setTextFilter,
      searchText: textFilter,
    }),
    [clearFilters, filter, filterControls, onFilterButtonPress, textFilter]
  );
  const typedContextValue = contextValue as FilteringContextProps<string, RelistenObject> &
    FilteringContextProps<K, T>;

  return (
    <FilteringContext.Provider value={typedContextValue}>{children}</FilteringContext.Provider>
  );
};

export function searchForSubstring(haystack: string | undefined, lowercaseNeedle: string): boolean {
  if (!haystack) {
    return false;
  }

  return haystack.toLowerCase().indexOf(lowercaseNeedle) > -1;
}

export const useFilters = <K extends string, T extends RelistenObject>(): FilteringContextProps<
  K,
  T
> => {
  const context = useContext(FilteringContext);

  if (context === undefined) {
    throw new Error('useFilters must be used within a FilteringProvider');
  }

  return context as FilteringContextProps<string, RelistenObject> & FilteringContextProps<K, T>;
};
