import MyLibraryPage from '@/app/relisten/tabs/(artists,myLibrary,offline)/myLibrary';
import { NonSearchFilterBar } from '@/relisten/components/filtering/filter_bar';
import {
  Filter,
  FilteringOptions,
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
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RowWithAction } from '@/relisten/components/row_with_action';
import { ArtistListItem } from '@/relisten/components/artist_rows';
import { Artist } from '@/relisten/realm/models/artist';
import { useArtists } from '@/relisten/realm/models/artist_repo';
import { useRemainingDownloads } from '@/relisten/realm/models/offline_repo';
import { useGroupSegment, useIsOfflineTab } from '@/relisten/util/routes';
import { Link, useRouter } from 'expo-router';
import { useMemo, type ReactElement } from 'react';
import { TouchableOpacity, View } from 'react-native';
import Realm from 'realm';
import { ArtistShowsOnThisDayTray } from '@/relisten/pages/artist/artist_shows_on_this_day_tray';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { useRelistenApi } from '@/relisten/api/context';
import { sample } from 'remeda';
import { LegacyDataMigrationModal } from '@/relisten/pages/legacy_migration';

const ALL_ARTISTS_LIMIT = 100;

const FavoritesSectionHeader = ({ favorites }: { favorites: Artist[] }) => {
  const { apiClient } = useRelistenApi();
  const { pushShow } = usePushShowRespectingUserSettings();

  const playRandomShow = async () => {
    const randomFavorite = sample([...favorites], 1)[0]!;
    const randomShow = await apiClient.randomShow(randomFavorite.uuid);

    if (randomShow?.data?.uuid) {
      pushShow({
        artist: randomFavorite,
        showUuid: randomShow!.data!.uuid,
        overrideGroupSegment: '(artists)',
      });
    }
  };

  return (
    <View>
      <View className="flex flex-row items-center justify-between px-4">
        <RelistenText className="text-m font-bold">Favorites</RelistenText>
        <RelistenButton className="m-2" asyncOnPress={playRandomShow} automaticLoadingIndicator>
          Random Show
        </RelistenButton>
      </View>
      <ArtistShowsOnThisDayTray artists={favorites} />
    </View>
  );
};

export enum FeaturedSortKey {
  Name = 'name',
  Popular = 'popular',
  Trending = 'trending',
  Search = 'search',
}

const FEATURED_SORT_FILTERS: Filter<FeaturedSortKey, Artist>[] = [
  {
    persistenceKey: FeaturedSortKey.Name,
    title: 'Name',
    sortDirection: SortDirection.Ascending,
    active: true,
    isNumeric: false,
    sort: (artists) => artists.sort((a, b) => a.sortName.localeCompare(b.sortName)),
  },
  {
    persistenceKey: FeaturedSortKey.Popular,
    title: 'Popular',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (artists) =>
      artists.sort((a, b) => (a.popularity?.hotScore ?? 0) - (b.popularity?.hotScore ?? 0)),
  },
  {
    persistenceKey: FeaturedSortKey.Trending,
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
    persistenceKey: FeaturedSortKey.Search,
    title: 'Search',
    active: false,
    searchFilter: () => true,
  },
];

type ArtistsListProps = {
  artists: Realm.Results<Artist>;
  filterOptions: FilteringOptions<FeaturedSortKey>;
};

const FeaturedSectionHeader = () => {
  const router = useRouter();
  const groupSegment = useGroupSegment();
  const { filters, onFilterButtonPress } = useFilters<FeaturedSortKey, Artist>();

  const allArtistsRoute = `/relisten/tabs/${groupSegment}/all`;

  return (
    <View>
      <View className="bg-relisten-blue-800 px-4 py-2">
        <RowWithAction title="Featured Artists" subtitle="Top artists right now">
          <RelistenButton intent="outline" size="thin" onPress={() => router.push(allArtistsRoute)}>
            View All
          </RelistenButton>
        </RowWithAction>
      </View>
      <View className="bg-relisten-blue-800">
        <NonSearchFilterBar
          filters={filters}
          onFilterButtonPress={onFilterButtonPress}
          enterSearch={() => router.push(allArtistsRoute)}
        />
      </View>
    </View>
  );
};

const FavoritesEmptyState = ({ onViewAll }: { onViewAll: () => void }) => {
  return (
    <View className="px-4 py-6">
      <RelistenText className="text-xl font-bold">Build your library</RelistenText>
      <RelistenText className="pt-2 text-gray-400">
        Add artists to build your library and get quick access to your favorites.
      </RelistenText>
      <View className="pt-4">
        <RelistenButton onPress={onViewAll}>Browse all 4,500+ artists</RelistenButton>
      </View>
    </View>
  );
};

const ArtistsListContent = ({ artists }: { artists: Realm.Results<Artist> }) => {
  const isOfflineTab = useIsOfflineTab();
  const router = useRouter();
  const groupSegment = useGroupSegment();
  const { filter } = useFilters<FeaturedSortKey, Artist>();

  const allArtistsRoute = `/relisten/tabs/${groupSegment}/all`;

  const { all, favorites, featured } = useMemo(() => {
    const allSorted = [...artists].sort((a, b) => a.sortName.localeCompare(b.sortName));
    const favoritesSorted = allSorted
      .filter((a) => a.isFavorite)
      .sort((a, b) => a.sortName.localeCompare(b.sortName));
    const featuredSorted = filter(
      allSorted.filter((a) => a.featured !== 0),
      undefined
    ).slice(0, ALL_ARTISTS_LIMIT);

    return {
      all: allSorted,
      favorites: favoritesSorted,
      featured: featuredSorted,
    };
  }, [artists, filter]);

  const sectionedArtists = useMemo<RelistenSectionData<Artist>>(() => {
    const sections: {
      sectionTitle?: string;
      data: Artist[];
      headerComponent?: ReactElement;
    }[] = [];

    if (isOfflineTab) {
      sections.push({ data: all });
      return sections;
    }

    if (favorites.length > 0) {
      sections.push({
        sectionTitle: 'Favorites',
        headerComponent: <FavoritesSectionHeader favorites={favorites} />,
        data: favorites,
      });
    }

    if (featured.length > 0) {
      sections.push({
        sectionTitle: 'Featured',
        headerComponent: <FeaturedSectionHeader />,
        data: featured,
      });
    }

    return sections;
  }, [all, favorites, featured, isOfflineTab]);

  return (
    <RelistenSectionList
      data={sectionedArtists}
      renderItem={({ item }) => {
        return <ArtistListItem artist={item} />;
      }}
      ListHeaderComponent={
        !isOfflineTab && favorites.length === 0 ? (
          <FavoritesEmptyState onViewAll={() => router.push(allArtistsRoute)} />
        ) : undefined
      }
      pullToRefresh
    />
  );
};

const ArtistsList = ({ artists, filterOptions }: ArtistsListProps) => {
  return (
    <FilteringProvider filters={FEATURED_SORT_FILTERS} options={filterOptions}>
      <ArtistsListContent artists={artists} />
    </FilteringProvider>
  );
};

export default function Page() {
  const results = useArtists();
  const groupSegment = useGroupSegment();
  const { data: artists } = results;

  const downloads = useRemainingDownloads();

  if (groupSegment === '(myLibrary)') {
    return <MyLibraryPage />;
  }

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={results}>
        {downloads.length > 0 && (
          <TouchableOpacity>
            <Link
              href={{
                pathname: `/relisten/tabs/${groupSegment}/downloading`,
              }}
              className="bg-relisten-blue-700 px-4 py-4 text-center"
            >
              <RelistenText>{downloads.length} tracks downloading&nbsp;›</RelistenText>
            </Link>
          </TouchableOpacity>
        )}

        <ArtistsList
          artists={artists}
          filterOptions={{
            persistence: { key: 'artists/featured' },
            default: {
              persistenceKey: FeaturedSortKey.Name,
              sortDirection: SortDirection.Ascending,
              active: true,
            },
          }}
        />
      </RefreshContextProvider>
      <LegacyDataMigrationModal />
    </View>
  );
}
