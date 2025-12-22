import { searchForSubstring } from '@/relisten/components/filtering/filters';
import { Artist } from '@/relisten/realm/models/artist';
import { Filter, SortDirection } from '@/relisten/components/filtering/filters';

export enum ArtistSortKey {
  Name = 'name',
  Popular = 'popular',
  Trending = 'trending',
  Shows = 'shows',
  Tapes = 'tapes',
  Search = 'search',
}

export const ARTIST_SORT_FILTERS: Filter<ArtistSortKey, Artist>[] = [
  {
    persistenceKey: ArtistSortKey.Name,
    title: 'Name',
    sortDirection: SortDirection.Ascending,
    active: true,
    isNumeric: false,
    sort: (artists) => artists.sort((a, b) => a.sortName.localeCompare(b.sortName)),
  },
  {
    persistenceKey: ArtistSortKey.Popular,
    title: 'Popular',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (artists) =>
      artists.sort((a, b) => (a.popularity?.hotScore ?? 0) - (b.popularity?.hotScore ?? 0)),
  },
  {
    persistenceKey: ArtistSortKey.Trending,
    title: 'Trending',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (artists) =>
      artists.sort(
        (a, b) => (a.popularity?.momentumScore ?? 0) - (b.popularity?.momentumScore ?? 0)
      ),
  },
  {
    persistenceKey: ArtistSortKey.Shows,
    title: 'Shows',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (artists) => artists.sort((a, b) => (a.showCount ?? 0) - (b.showCount ?? 0)),
  },
  {
    persistenceKey: ArtistSortKey.Tapes,
    title: 'Tapes',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (artists) => artists.sort((a, b) => (a.sourceCount ?? 0) - (b.sourceCount ?? 0)),
  },
  {
    persistenceKey: ArtistSortKey.Search,
    title: 'Search',
    active: false,
    searchFilter: (artist, searchText) => {
      return searchForSubstring(artist.name, searchText.toLowerCase());
    },
  },
];
