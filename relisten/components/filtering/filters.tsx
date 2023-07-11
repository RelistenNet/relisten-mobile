import React, { PropsWithChildren, useCallback, useContext, useEffect, useState } from 'react';
import { RelistenObject } from '../../api/models/relisten';

export enum SortDirection {
  UNKNOWN = 0,
  Ascending,
  Descending,
}

export interface Filter<T> {
  sortDirection?: SortDirection;
  isNumeric?: boolean;
  active: boolean;
  title: string;

  // You must provide one of the two
  sort?: (data: T[]) => void;
  filter?: (data: T) => boolean;
}

export interface FilteringContextProps<T extends RelistenObject> {
  filters: ReadonlyArray<Filter<T>>;
  onFilterButtonPress: (filter: Filter<T>) => void;
  filter: (allData: ReadonlyArray<T>) => ReadonlyArray<T>;

  filteredData: T[] | undefined;
  setRawData: React.Dispatch<React.SetStateAction<T[] | undefined>>;
}

export const FilteringContext = React.createContext<FilteringContextProps<any> | undefined>(
  undefined
);

export const FilteringProvider = <T extends RelistenObject>({
  children,
  filters,
}: PropsWithChildren<{ filters: ReadonlyArray<Filter<T>> }>) => {
  const [rawData, setRawData] = useState<T[] | undefined>(undefined);
  const [filteredData, setFilteredData] = useState<T[] | undefined>(undefined);

  const filter = useCallback(
    (allData: ReadonlyArray<T>) => {
      const filteredData: T[] = [];

      for (const row of allData) {
        let allowed = true;

        for (const filter of filters) {
          if (filter.active && filter.filter && !filter.filter(row)) {
            allowed = false;
            break;
          }
        }

        if (allowed) {
          filteredData.push(row);
        }
      }

      for (const filter of filters) {
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
    [filters]
  );

  useEffect(() => {
    if (rawData) {
      setFilteredData(filter(rawData));
    }
  }, [rawData, filter, setFilteredData]);

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

      if (rawData) {
        setFilteredData(filter(rawData));
      }
    },
    [filters, filter, setFilteredData, rawData]
  );

  return (
    <FilteringContext.Provider
      value={{ filters, onFilterButtonPress, filter, setRawData, filteredData }}
    >
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
