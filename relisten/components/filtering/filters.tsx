import { RouteFilterConfig, serializeFilters } from '@/relisten/realm/models/route_filter_config';
import { useObject, useRealm } from '@/relisten/realm/schema';
import React, { PropsWithChildren, useCallback, useContext, useEffect, useState } from 'react';
import { RelistenObject } from '../../api/models/relisten';

export enum SortDirection {
  UNKNOWN = 0,
  Ascending,
  Descending,
}

export interface PersistedFilter<K extends string> {
  persistenceKey: K;
  active: boolean;
  sortDirection?: SortDirection;
}

export interface Filter<K extends string, T> extends PersistedFilter<K> {
  isNumeric?: boolean;
  title: string;

  // You must provide one of the two
  sort?: (data: T[]) => void;
  filter?: (data: T) => boolean;
}

export interface FilteringOptions<K extends string> {
  persistence?: { key: string };
  default?: { persistenceKey: K; active: boolean; sortDirection?: SortDirection };
}

export interface FilteringContextProps<K extends string, T extends RelistenObject> {
  filters: ReadonlyArray<Filter<K, T>>;
  onFilterButtonPress: (filter: Filter<K, T>) => void;
  filter: (allData: ReadonlyArray<T>) => ReadonlyArray<T>;
}

export const FilteringContext = React.createContext<FilteringContextProps<any, any> | undefined>(
  undefined
);

export const FilteringProvider = <K extends string, T extends RelistenObject>({
  children,
  filters,
  options,
}: PropsWithChildren<{ filters: ReadonlyArray<Filter<K, T>>; options?: FilteringOptions<K> }>) => {
  const realm = useRealm();
  const [preparedFilters, setPreparedFilters] = useState(filters);

  const filterPersistenceKey = options?.persistence?.key;

  const routeFilterConfig = useObject(RouteFilterConfig, filterPersistenceKey || '__no_object__');
  const persistedFilters = routeFilterConfig ? routeFilterConfig.filters() : undefined;

  // useEffect with setState to apply the default sort only 1 time.
  useEffect(() => {
    for (const filter of filters) {
      if (options?.default && options.default.persistenceKey === filter.persistenceKey) {
        filter.active = options.default.active;
        filter.sortDirection = options.default.sortDirection;
      } else {
        filter.active = false;
      }
    }

    setPreparedFilters([...filters]);
  }, [filters, options?.default, setPreparedFilters]);

  const filter = useCallback(
    (allData: ReadonlyArray<T>) => {
      const filteredData: T[] = [];

      // merge pre-defined filters with persisted/user filters
      const mergedFilters = preparedFilters.map((filter) => {
        const persistedFilter = persistedFilters?.[filter.persistenceKey];

        if (persistedFilter) {
          return {
            ...filter,
            ...persistedFilter,
          };
        }

        return filter;
      });

      for (const row of allData) {
        let allowed = true;

        for (const filter of mergedFilters) {
          if (filter.active && filter?.filter && !filter.filter(row)) {
            allowed = false;
            break;
          }
        }

        if (allowed) {
          filteredData.push(row);
        }
      }

      for (const filter of mergedFilters) {
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
    [preparedFilters, persistedFilters]
  );

  const onFilterButtonPress = useCallback(
    (thisFilter: Filter<K, T>) => {
      /*
    - multiple thisFilters can be active at the same time
    - thisFilters can be active at the same time as sorting
    - only 1 thing can sort at a time
    - there's always 1 sort active at any time
     */
      if (thisFilter.sortDirection !== undefined) {
        // disable other sorts
        for (const f of preparedFilters) {
          if (f !== thisFilter && f.sortDirection !== undefined) {
            f.active = false;
          }
        }

        if (thisFilter.active) {
          // if already active, flip the direction
          if (thisFilter.sortDirection === SortDirection.Ascending) {
            thisFilter.sortDirection = SortDirection.Descending;
          } else if (thisFilter.sortDirection === SortDirection.Descending) {
            thisFilter.sortDirection = SortDirection.Ascending;
          }
        } else {
          // otherwise, just activate the thisFilter
          thisFilter.active = true;
        }
      } else {
        thisFilter.active = !thisFilter.active;
      }

      if (filterPersistenceKey) {
        realm.write(() => {
          let routeFilterConfig = realm.objectForPrimaryKey(
            RouteFilterConfig,
            filterPersistenceKey
          );

          if (routeFilterConfig) {
            routeFilterConfig.setFilters(preparedFilters);
          } else {
            routeFilterConfig = realm.create(RouteFilterConfig, {
              key: filterPersistenceKey,
              rawFilters: serializeFilters(preparedFilters),
            });
          }
        });
      }

      setPreparedFilters([...preparedFilters]);
    },
    [preparedFilters, realm, filterPersistenceKey, options, setPreparedFilters]
  );

  return (
    <FilteringContext.Provider value={{ filters: preparedFilters, onFilterButtonPress, filter }}>
      {children}
    </FilteringContext.Provider>
  );
};

export const useFilters = <K extends string, T extends RelistenObject>() => {
  const context = useContext(FilteringContext);

  if (context === undefined) {
    throw new Error('useFilters must be used within a FilteringProvider');
  }

  return context as FilteringContextProps<K, T>;
};
