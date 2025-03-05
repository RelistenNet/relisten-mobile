import { Filter, SortDirection } from '@/relisten/components/filtering/filters';
import { Year } from '@/relisten/realm/models/year';

export enum YearFilterKey {
  Library = 'library',
  Downloads = 'downloads',
  Year = 'year',
  Shows = 'shows',
  Tapes = 'tapes',
  Search = 'search',
}

export const YEAR_FILTERS: Filter<YearFilterKey, Year>[] = [
  {
    persistenceKey: YearFilterKey.Library,
    title: 'My Library',
    active: false,
    filter: (year) =>
      year.hasOfflineTracks || year.sourceTracks.filtered('show.isFavorite == true').length > 0,
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
