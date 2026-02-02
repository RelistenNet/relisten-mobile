import MyLibraryPage from '@/app/relisten/tabs/(artists,myLibrary,offline)/myLibrary';
import { NonSearchFilterBar } from '@/relisten/components/filtering/filter_bar';
import {
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
import { SectionHeader } from '@/relisten/components/section_header';
import { RelistenText } from '@/relisten/components/relisten_text';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RowWithAction } from '@/relisten/components/row_with_action';
import { NonIdealState } from '@/relisten/components/non_ideal_state';
import { ArtistListItem } from '@/relisten/components/artist_rows';
import { Artist } from '@/relisten/realm/models/artist';
import { useArtists } from '@/relisten/realm/models/artist_repo';
import { useRemainingDownloads } from '@/relisten/realm/models/offline_repo';
import { useGroupSegment, useIsOfflineTab } from '@/relisten/util/routes';
import { Link, useRouter } from 'expo-router';
import { useMemo, type ReactElement } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import Realm from 'realm';
import { ArtistShowsOnThisDayTray } from '@/relisten/pages/artist/artist_shows_on_this_day_tray';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { useRelistenApi } from '@/relisten/api/context';
import { sample } from 'remeda';
import { LegacyDataMigrationModal } from '@/relisten/pages/legacy_migration';
import { ARTIST_SORT_FILTERS, ArtistSortKey } from '@/relisten/components/artist_filters';
import { ScrollScreen } from '@/relisten/components/screens/ScrollScreen';

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

type ArtistsListProps = {
  artists: Realm.Results<Artist>;
  filterOptions: FilteringOptions<ArtistSortKey>;
};

const FeaturedSectionHeader = () => {
  const router = useRouter();
  const groupSegment = useGroupSegment();
  const { filters, onFilterButtonPress } = useFilters<ArtistSortKey, Artist>();

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
        <ScrollView horizontal keyboardShouldPersistTaps="handled">
          <NonSearchFilterBar
            filters={filters}
            onFilterButtonPress={onFilterButtonPress}
            enterSearch={() => router.push(allArtistsRoute)}
          />
        </ScrollView>
      </View>
    </View>
  );
};

const FavoritesEmptyState = ({ onViewAll }: { onViewAll: () => void }) => {
  return (
    <View className="px-4 py-6">
      <RelistenText className="text-xl font-bold">Follow the music</RelistenText>
      <RelistenText className="pt-2 text-gray-400">
        Tap the heart to favorite artists. You’ll get On This Day picks and quick access to your
        go-tos.
      </RelistenText>
      <View className="pt-4">
        <RelistenButton onPress={onViewAll}>Browse all 4,000+ artists</RelistenButton>
      </View>
    </View>
  );
};

const ArtistsListContent = ({ artists }: { artists: Realm.Results<Artist> }) => {
  const isOfflineTab = useIsOfflineTab();
  const router = useRouter();
  const groupSegment = useGroupSegment();
  const { filter } = useFilters<ArtistSortKey, Artist>();

  const allArtistsRoute = `/relisten/tabs/${groupSegment}/all`;

  const { all, favorites, featured } = useMemo(() => {
    const allSorted = [...artists].sort((a, b) => a.sortName.localeCompare(b.sortName));
    const favoritesSorted = allSorted
      .filter((a) => a.isFavorite)
      .sort((a, b) => a.sortName.localeCompare(b.sortName));
    const featuredAll = allSorted.filter((a) => !a.isAutomaticallyCreated());
    const hasPopularity = featuredAll.some(
      (artist) => artist.popularity?.windows?.days30d?.plays !== undefined
    );
    const featuredCandidates = hasPopularity
      ? [...featuredAll]
          .sort(
            (a, b) =>
              (b.popularity?.windows?.days30d?.plays ?? 0) -
              (a.popularity?.windows?.days30d?.plays ?? 0)
          )
          .slice(0, 100)
      : featuredAll;
    const featuredSorted = filter(featuredCandidates, undefined);

    return {
      all: allSorted,
      favorites: favoritesSorted,
      featured: featuredSorted,
    };
  }, [artists, filter]);

  const sectionedArtists = useMemo<RelistenSectionData<Artist>>(() => {
    const sections: {
      sectionTitle?: string;
      data: ReadonlyArray<Artist>;
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

  if (isOfflineTab && artists.length === 0) {
    return (
      <NonIdealState
        icon="cloud-off"
        title="No offline shows yet"
        description="Download tracks from any show and they'll appear here for offline playback."
        actionText="Browse all artists"
        onAction={() => router.push(allArtistsRoute)}
      />
    );
  }

  return (
    <RelistenSectionList
      data={sectionedArtists}
      renderItem={({ item }) => {
        return <ArtistListItem artist={item} />;
      }}
      renderSectionHeader={({ headerComponent, sectionTitle }) => {
        if (headerComponent) {
          return <View>{headerComponent}</View>;
        }

        return <SectionHeader title={sectionTitle} />;
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
    <FilteringProvider filters={ARTIST_SORT_FILTERS} options={filterOptions}>
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
    <ScrollScreen>
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
              persistenceKey: ArtistSortKey.Popular,
              sortDirection: SortDirection.Descending,
              active: true,
            },
          }}
        />
      </RefreshContextProvider>
      <LegacyDataMigrationModal />
    </ScrollScreen>
  );
}
