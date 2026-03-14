import { Filter, SortDirection } from '@/relisten/components/filtering/filters';
import { Year } from '@/relisten/realm/models/year';
import { useLibraryMembershipIndex } from '@/relisten/realm/root_services';
import { useMemo } from 'react';

export enum YearFilterKey {
  Library = 'library',
  Downloads = 'downloads',
  Year = 'year',
  Popular = 'popular',
  Trending = 'trending',
  Shows = 'shows',
  Tapes = 'tapes',
  Search = 'search',
}

export function useYearFilters(): Filter<YearFilterKey, Year>[] {
  const libraryIndex = useLibraryMembershipIndex();

  return useMemo(() => {
    return [
      {
        persistenceKey: YearFilterKey.Library,
        title: 'My Library',
        active: false,
        filter: (year) => libraryIndex.yearIsInLibrary(year.uuid),
        isGlobal: true,
      },
      {
        persistenceKey: YearFilterKey.Year,
        title: 'Date',
        sortDirection: SortDirection.Ascending,
        active: true,
        isNumeric: true,
        sort: (years) => years.sort((a, b) => a.year.localeCompare(b.year)),
      },
      {
        persistenceKey: YearFilterKey.Popular,
        title: 'Popular',
        sortDirection: SortDirection.Descending,
        active: false,
        isNumeric: true,
        sort: (years) =>
          years.sort(
            (a, b) =>
              (a.popularity?.windows?.days30d?.hotScore ?? 0) -
              (b.popularity?.windows?.days30d?.hotScore ?? 0)
          ),
      },
      {
        persistenceKey: YearFilterKey.Trending,
        title: 'Trending',
        sortDirection: SortDirection.Descending,
        active: false,
        isNumeric: true,
        sort: (years) =>
          years.sort(
            (a, b) => (a.popularity?.momentumScore ?? 0) - (b.popularity?.momentumScore ?? 0)
          ),
      },
      {
        persistenceKey: YearFilterKey.Shows,
        title: 'Shows',
        sortDirection: SortDirection.Descending,
        active: false,
        isNumeric: true,
        sort: (years) => years.sort((a, b) => a.showCount - b.showCount),
      },
      {
        persistenceKey: YearFilterKey.Tapes,
        title: 'Tapes',
        sortDirection: SortDirection.Descending,
        active: false,
        isNumeric: true,
        sort: (years) => years.sort((a, b) => a.sourceCount - b.sourceCount),
      },
      {
        persistenceKey: YearFilterKey.Search,
        title: 'Search',
        active: false,
        searchFilter: (year: Year, searchText: string) => {
          return year.year.indexOf(searchText) !== -1;
        },
      },
    ];
  }, [libraryIndex]);
}
