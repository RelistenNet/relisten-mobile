import { SearchFilterBar } from '@/relisten/components/filtering/filter_bar';
import {
  Filter,
  FilteringProvider,
  searchForSubstring,
  useFilters,
} from '@/relisten/components/filtering/filters';
import { FilterableList } from '@/relisten/components/filtering/filterable_list';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { WebRewriteLoader } from '@/relisten/components/web_rewrite_loader';
import { ArtistCompactListItem } from '@/relisten/components/artist_rows';
import { Artist } from '@/relisten/realm/models/artist';
import { useAllArtists } from '@/relisten/realm/models/artist_repo';
import { NetworkBackedBehaviorFetchStrategy } from '@/relisten/realm/network_backed_behavior';
import { useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { TextInput, View } from 'react-native';

export enum AllArtistsFilterKey {
  Search = 'search',
}

const ALL_ARTISTS_FILTERS: Filter<AllArtistsFilterKey, Artist>[] = [
  {
    persistenceKey: AllArtistsFilterKey.Search,
    title: 'Search',
    active: false,
    searchFilter: (artist, searchText) => {
      const search = searchText.toLowerCase();
      return searchForSubstring(artist.name, search);
    },
  },
];

const AllArtistsHeader = () => {
  const { onSearchTextChanged, searchText } = useFilters<AllArtistsFilterKey, Artist>();
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  return (
    <View>
      <RelistenText className="px-4 pt-4 text-2xl font-bold">All Artists</RelistenText>
      <SearchFilterBar
        search={onSearchTextChanged}
        exitSearch={() => onSearchTextChanged(undefined)}
        searchText={searchText}
        innerRef={searchInputRef}
      />
    </View>
  );
};

const AllArtistsList = ({ artists, isLoading }: { artists: Artist[]; isLoading: boolean }) => {
  const data = useMemo(() => {
    return [...artists].sort((a, b) => a.sortName.localeCompare(b.sortName));
  }, [artists]);

  if (isLoading && data.length === 0) {
    return <WebRewriteLoader />;
  }

  return (
    <FilterableList
      data={[{ data }]}
      hideFilterBar
      isLoading={isLoading}
      nonIdealState={{
        noData: {
          title: 'No artists loaded',
          description: 'Pull to refresh or try again later.',
        },
        filtered: {
          title: 'No Results',
          description: 'No artists found. Try a different search.',
        },
      }}
      renderItem={({ item }) => {
        return <ArtistCompactListItem artist={item} />;
      }}
      pullToRefresh
    />
  );
};

export default function Page() {
  const navigation = useNavigation();
  const results = useAllArtists({
    fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkAlwaysFirst,
  });

  useEffect(() => {
    navigation.setOptions({ title: 'All Artists' });
  }, [navigation]);

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <FilteringProvider
        filters={ALL_ARTISTS_FILTERS}
        options={{ persistence: { key: 'artists/all' } }}
      >
        <AllArtistsHeader />
        <AllArtistsList artists={[...results.data]} isLoading={results.isNetworkLoading} />
      </FilteringProvider>
    </RefreshContextProvider>
  );
}
