import { RouteFilterConfig, serializeFilters } from '@/relisten/realm/models/route_filter_config';
import { useObject, useRealm } from '@/relisten/realm/schema';
import React, { PropsWithChildren, useCallback, useContext } from 'react';
import { RelistenObject } from '../../api/models/relisten';

export enum SortDirection {
  UNKNOWN = 0,
  Ascending,
  Descending,
}

export interface PersistedFilter {
  persistenceKey: string;
  active: boolean;
  sortDirection?: SortDirection;
}

export interface Filter<T> extends PersistedFilter {
  isNumeric?: boolean;
  title: string;

  // You must provide one of the two
  sort?: (data: T[]) => void;
  filter?: (data: T) => boolean;
}

export interface FilteringContextProps<T extends RelistenObject> {
  filters: ReadonlyArray<Filter<T>>;
  onFilterButtonPress: (filter: Filter<T>) => void;
  filter: (allData: ReadonlyArray<T>) => ReadonlyArray<T>;
}

export const FilteringContext = React.createContext<FilteringContextProps<any> | undefined>(
  undefined
);

export const FilteringProvider = <T extends RelistenObject>({
  children,
  filters,
  filterPersistenceKey,
}: PropsWithChildren<{ filters: ReadonlyArray<Filter<T>>; filterPersistenceKey: string }>) => {
  const realm = useRealm();

  const routeFilterConfig = useObject(RouteFilterConfig, filterPersistenceKey);

  const persistedFilters = routeFilterConfig ? routeFilterConfig.filters() : [];

  const filter = useCallback(
    (allData: ReadonlyArray<T>) => {
      const filteredData: T[] = [];

      const mergedFilters = filters.reduce((memo, next) => {
        const persistedFilter = persistedFilters.find(
          (pf) => pf.persistenceKey === next.persistenceKey
        );
        if (persistedFilter) {
          memo.push({
            ...next,
            ...persistedFilter,
          });
        }
        return memo;
      }, [] as Filter<T>[]);

      for (const row of allData) {
        let allowed = true;

        for (const filter of mergedFilters) {
          const rawFilter = filters.find((f) => f.persistenceKey === filter.persistenceKey);
          if (filter.active && rawFilter?.filter && !rawFilter.filter(row)) {
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

          if (filter.sortDirection === SortDirection.Ascending) {
            filteredData.reverse();
          }

          break;
        }
      }

      return filteredData;
    },
    [filters, persistedFilters]
  );

  const onFilterButtonPress = useCallback(
    (thisFilter: Filter<T>) => {
      /*
    - multiple thisFilters can be active at the same time
    - thisFilters can be active at the same time as sorting
    - only 1 thing can sort at a time
    - there's always 1 sort active at any time
     */
      if (thisFilter.sortDirection !== undefined) {
        // disable other sorts
        for (const f of filters) {
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

      realm.write(() => {
        let routeFilterConfig = realm.objectForPrimaryKey(RouteFilterConfig, filterPersistenceKey);

        if (routeFilterConfig) {
          routeFilterConfig.setFilters(filters);
        } else {
          routeFilterConfig = realm.create(RouteFilterConfig, {
            key: filterPersistenceKey,
            rawFilters: serializeFilters(filters),
          });
        }
      });
    },
    [filters, realm, filterPersistenceKey]
  );

  return (
    <FilteringContext.Provider value={{ filters, onFilterButtonPress, filter }}>
      {children}
    </FilteringContext.Provider>
  );
};

export const useFilters = <T extends RelistenObject>() => {
  const context = useContext(FilteringContext);

  if (context === undefined) {
    throw new Error('useFilters must be used within a FilteringProvider');
  }

  return context as FilteringContextProps<T>;
};
