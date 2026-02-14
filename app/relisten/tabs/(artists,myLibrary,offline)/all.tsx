import { NonSearchFilterBar, SearchFilterBar } from '@/relisten/components/filtering/filter_bar';
import {
  FilteringProvider,
  SortDirection,
  useFilters,
} from '@/relisten/components/filtering/filters';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import {
  RelistenSectionData,
  RelistenSectionList,
} from '@/relisten/components/relisten_section_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import { WebRewriteLoader } from '@/relisten/components/web_rewrite_loader';
import { ArtistListItem } from '@/relisten/components/artist_rows';
import { ARTIST_SORT_FILTERS, ArtistSortKey } from '@/relisten/components/artist_filters';
import { Artist } from '@/relisten/realm/models/artist';
import { useAllArtists } from '@/relisten/realm/models/artist_repo';
import { useNavigation } from 'expo-router';
import { type ReactElement, useEffect, useMemo, useRef } from 'react';
import { Keyboard, ScrollView, TextInput, View } from 'react-native';
import { ScrollScreen } from '@/relisten/components/screens/ScrollScreen';
import { useRelistenPlayerBottomBarContext } from '@/relisten/player/ui/player_bottom_bar';

const AllArtistsHeader = ({ artists }: { artists?: Realm.Results<Artist> }) => {
  const searchInputRef = useRef<TextInput>(null);
  const { filters, onFilterButtonPress, onSearchTextChanged, searchText } = useFilters<
    ArtistSortKey,
    Artist
  >();

  return (
    <View>
      <RelistenText className="px-4 pt-4 text-2xl font-bold">
        All {artists ? artists.length + ' ' : ''}Artists
      </RelistenText>
      <ScrollView horizontal keyboardShouldPersistTaps="handled">
        <NonSearchFilterBar
          filters={filters}
          onFilterButtonPress={onFilterButtonPress}
          enterSearch={() => searchInputRef.current?.focus()}
        />
      </ScrollView>
      <SearchFilterBar
        search={onSearchTextChanged}
        exitSearch={() => onSearchTextChanged('')}
        searchText={searchText}
        innerRef={searchInputRef}
      />
    </View>
  );
};

const AllArtistsList = ({
  artists,
  isLoading,
  listHeader,
}: {
  artists: Artist[];
  isLoading: boolean;
  listHeader: ReactElement;
}) => {
  const { collapsedSheetFootprint } = useRelistenPlayerBottomBarContext();
  const { filter, searchText } = useFilters<ArtistSortKey, Artist>();

  const data = useMemo(() => {
    return filter([...artists], searchText);
  }, [artists, filter, searchText]);

  if (isLoading && data.length === 0) {
    return <WebRewriteLoader />;
  }

  const sectionedData: RelistenSectionData<Artist> = [{ data }];

  return (
    <RelistenSectionList
      data={sectionedData}
      ListHeaderComponent={listHeader}
      renderItem={({ item }) => {
        return <ArtistListItem artist={item} />;
      }}
      contentContainerStyle={{ paddingBottom: collapsedSheetFootprint }}
      scrollIndicatorInsets={{ bottom: collapsedSheetFootprint }}
      keyboardDismissMode="on-drag"
      onScrollBeginDrag={() => Keyboard.dismiss()}
      pullToRefresh
    />
  );
};

export default function Page() {
  const navigation = useNavigation();
  const allArtists = useAllArtists();

  useEffect(() => {
    navigation.setOptions({ title: 'All Artists' });
  }, [navigation]);

  return (
    <ScrollScreen reserveBottomInset={false}>
      <FilteringProvider
        filters={ARTIST_SORT_FILTERS}
        options={{
          persistence: { key: 'artists/all' },
          default: {
            persistenceKey: ArtistSortKey.Name,
            sortDirection: SortDirection.Ascending,
            active: true,
          },
        }}
      >
        <RefreshContextProvider networkBackedResults={allArtists}>
          <AllArtistsList
            artists={[...allArtists.data]}
            isLoading={allArtists.isNetworkLoading}
            listHeader={<AllArtistsHeader artists={allArtists.data} />}
          />
        </RefreshContextProvider>
      </FilteringProvider>
    </ScrollScreen>
  );
}
