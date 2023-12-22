import { FavoriteObjectButton } from '@/relisten/components/favorite_icon_button';
import {
  FilterableList,
  FilterableListProps,
} from '@/relisten/components/filtering/filterable_list';
import {
  Filter,
  FilteringOptions,
  FilteringProvider,
  SortDirection,
  useFilters,
} from '@/relisten/components/filtering/filters';
import Flex from '@/relisten/components/flex';
import Plur from '@/relisten/components/plur';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenSectionHeader } from '@/relisten/components/relisten_section_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { useRelistenPlayerBottomBarContext } from '@/relisten/player/ui/player_bottom_bar';
import { Artist } from '@/relisten/realm/models/artist';
import { useArtists } from '@/relisten/realm/models/artist_repo';
import { SourceTrackOfflineInfoStatus } from '@/relisten/realm/models/source_track_offline_info';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Link } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Realm from 'realm';

export enum ArtistFilterKey {
  Library = 'library',
  Downloads = 'downloads',
  Year = 'year',
  Shows = 'shows',
  Tapes = 'tapes',
}

const ArtistListItem = React.forwardRef(({ artist }: { artist: Artist }, ref) => {
  return (
    <Link
      href={{
        pathname: '/relisten/(tabs)/artists/[artistUuid]/' as const,
        params: {
          artistUuid: artist.uuid,
        },
      }}
      asChild
    >
      <SectionedListItem ref={ref}>
        <Flex cn="justify-between" full>
          <Flex cn="flex-1 flex-col pr-3">
            <RowTitle>{artist.name}</RowTitle>
            <SubtitleRow cn="flex flex-row justify-between">
              <SubtitleText>
                <Plur word="show" count={artist.showCount} />
              </SubtitleText>
              <SubtitleText>
                <Plur word="tape" count={artist.sourceCount} />
              </SubtitleText>
            </SubtitleRow>
          </Flex>
          <FavoriteObjectButton object={artist} />
        </Flex>
      </SectionedListItem>
    </Link>
  );
});

const ARTIST_FILTERS: Filter<ArtistFilterKey, Artist>[] = [
  {
    persistenceKey: ArtistFilterKey.Library,
    title: 'My Library',
    active: false,
    filter: (y) => y.isFavorite,
  },
  {
    persistenceKey: ArtistFilterKey.Downloads,
    title: 'My Downloads',
    active: false,
    filter: () => true,
    realmFilter: (items) =>
      items.filtered(
        'SUBQUERY(sourceTracks, $item, $item.offlineInfo.status == $0).@count > 0',
        SourceTrackOfflineInfoStatus.Succeeded
      ),
    isGlobal: true,
  },
  {
    persistenceKey: ArtistFilterKey.Shows,
    title: 'Shows',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (years) => years.sort((a, b) => a.showCount - b.showCount),
  },
  {
    persistenceKey: ArtistFilterKey.Tapes,
    title: 'Tapes',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (years) => years.sort((a, b) => a.sourceCount - b.sourceCount),
  },
];

type ArtistsListProps = {
  artists: Realm.Results<Artist>;
  filterOptions: FilteringOptions<ArtistFilterKey>;
} & Omit<FilterableListProps<Artist>, 'data' | 'renderItem'>;

const ArtistsListContainer = ({ filterOptions, ...props }: ArtistsListProps) => {
  return (
    <FilteringProvider filters={ARTIST_FILTERS} options={filterOptions}>
      <ArtistsList {...props} filterOptions={filterOptions} />
    </FilteringProvider>
  );
};

const ArtistsList = ({ artists, filterOptions, ...props }: ArtistsListProps) => {
  const { globalFilter } = useFilters();

  const sectionedArtists = useMemo(() => {
    const data = globalFilter<Artist>(artists);
    const all = [...data].sort((a, b) => {
      return a.sortName.localeCompare(b.sortName);
    });

    const r = [
      { sectionTitle: 'Featured' },
      ...all.filter((a) => a.featured !== 0).map((item) => ({ ...item, keyPrefix: 'featured' })),
      { sectionTitle: `${all.length} Artists` },
      ...all,
    ];

    const favorites = all.filter((a) => a.isFavorite);

    if (favorites.length > 0) {
      r.unshift(...favorites.map((item) => ({ ...item, keyPrefix: 'favorites' })));
      r.unshift({ sectionTitle: 'Favorites' });
    }

    return r as ReadonlyArray<Artist> & ReadonlyArray<Artist | RelistenSectionHeader>;
  }, [artists, globalFilter]);

  return (
    <FilterableList
      // ListHeaderComponent={<Ar artist={artist} />}
      data={sectionedArtists}
      renderItem={({ item }) => {
        return <ArtistListItem artist={item} />;
      }}
      {...props}
    />
  );
};

export default function Page() {
  const results = useArtists();
  const { data: artists } = results;

  const bottomTabBarHeight = useBottomTabBarHeight();
  const { setTabBarHeight } = useRelistenPlayerBottomBarContext();

  useEffect(() => {
    setTabBarHeight(bottomTabBarHeight);
  }, [bottomTabBarHeight, setTabBarHeight]);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={results}>
        <Link
          href={{
            pathname: '/relisten/(tabs)/artists/[artistUuid]/show/[showUuid]/source/[sourceUuid]/',
            params: {
              artistUuid: '77a58ff9-2e01-c59c-b8eb-cff106049b72',
              showUuid: '104c96e5-719f-366f-b72d-8d53709c80e0',
              sourceUuid: 'initial',
            },
          }}
          style={{ padding: 10 }}
        >
          <RelistenText>Barton hall test show</RelistenText>
        </Link>

        <DisappearingHeaderScreen
          ScrollableComponent={ArtistsListContainer}
          // ListHeaderComponent={<YearHeader artist={artist} year={year} />}
          artists={artists}
          filterOptions={{
            persistence: { key: ['artists'].join('/') },
          }}
        />
      </RefreshContextProvider>
    </View>
  );
}
