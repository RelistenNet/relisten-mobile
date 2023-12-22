import { useRelistenApi } from '@/relisten/api/context';
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
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Artist } from '@/relisten/realm/models/artist';
import { SourceTrackOfflineInfoStatus } from '@/relisten/realm/models/source_track_offline_info';
import { Year } from '@/relisten/realm/models/year';
import { useArtistYears } from '@/relisten/realm/models/year_repo';
import { Link, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Realm from 'realm';

export enum YearFilterKey {
  Library = 'library',
  Downloads = 'downloads',
  Year = 'year',
  Shows = 'shows',
  Tapes = 'tapes',
}

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid } = useLocalSearchParams();

  const results = useArtistYears(String(artistUuid));
  const {
    data: { years, artist },
  } = results;

  useEffect(() => {
    navigation.setOptions({
      title: artist?.name,
    });
  }, [artist]);

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        ScrollableComponent={YearsListContainer}
        artist={artist}
        years={years}
        filterOptions={{
          persistence: { key: ['artists', artistUuid, 'years'].join('/') },
          default: {
            persistenceKey: YearFilterKey.Year,
            sortDirection: SortDirection.Ascending,
            active: true,
          },
        }}
      />
    </RefreshContextProvider>
  );
}

const YearsHeader: React.FC<{ artist: Artist | null }> = ({ artist }) => {
  const { apiClient } = useRelistenApi();
  const router = useRouter();
  if (!artist) {
    return null;
  }

  const totalShows = artist.showCount;
  const totalSources = artist.sourceCount;

  const goToRandomShow = async () => {
    const randomShow = await apiClient.randomShow(artist.uuid);

    if (randomShow?.data?.uuid) {
      router.push({
        pathname: '/relisten/(tabs)/artists/[artistUuid]/show/[showUuid]/source/[sourceUuid]/',
        params: {
          artistUuid: artist.uuid,
          showUuid: randomShow!.data!.uuid,
          sourceUuid: 'initial',
        },
      });
    }
  };

  return (
    <View className="flex w-full items-center pb-1">
      <View className="w-full px-4 pb-4">
        <RelistenText
          className="w-full py-2 text-center text-4xl font-bold text-white"
          selectable={false}
        >
          {artist.name}
        </RelistenText>

        <RelistenText className="text-l w-full pb-2 text-center italic text-gray-400">
          {/* <Plur word="year" count={years.length} /> &middot;&nbsp; */}
          <Plur word="show" count={totalShows} /> &middot;&nbsp;
          <Plur word="tape" count={totalSources} />
        </RelistenText>
      </View>
      <View className="w-full flex-row px-4 pb-4" style={{ gap: 16 }}>
        <Link
          href={{
            pathname: '/relisten/(tabs)/artists/[artistUuid]/venues',
            params: {
              artistUuid: artist.uuid,
            },
          }}
          asChild
        >
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
            Venues
          </RelistenButton>
        </Link>
        <Link
          href={{
            pathname: '/relisten/(tabs)/artists/[artistUuid]/tours',
            params: {
              artistUuid: artist.uuid,
            },
          }}
          asChild
        >
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
            Tours
          </RelistenButton>
        </Link>
        <Link
          href={{
            pathname: '/relisten/(tabs)/artists/[artistUuid]/songs' as const,
            params: {
              artistUuid: artist.uuid,
            },
          }}
          asChild
        >
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
            Songs
          </RelistenButton>
        </Link>
      </View>
      <View className="w-full flex-row px-4 pb-4" style={{ gap: 16 }}>
        <Link
          href={{
            pathname: '/relisten/(tabs)/artists/[artistUuid]/rated' as const,
            params: {
              artistUuid: artist.uuid,
            },
          }}
          asChild
        >
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
            Top Rated
          </RelistenButton>
        </Link>
        <Link
          href={{
            pathname: '/relisten/(tabs)/artists/[artistUuid]/recent' as const,
            params: {
              artistUuid: artist.uuid,
            },
          }}
          asChild
        >
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
            Recent
          </RelistenButton>
        </Link>
        <RelistenButton
          className="shrink basis-1/3"
          textClassName="text-l"
          onPress={goToRandomShow}
        >
          Random
        </RelistenButton>
      </View>
    </View>
  );
};

const YearListItem = ({ year }: { year: Year }) => {
  return (
    <Link
      href={{
        pathname: '/relisten/(tabs)/artists/[artistUuid]/year/[yearUuid]/' as const,
        params: {
          artistUuid: year.artistUuid,
          yearUuid: year.uuid,
        },
      }}
      asChild
    >
      <SectionedListItem>
        <Flex cn="justify-between" full>
          <Flex column cn="flex-1">
            <RowTitle>{year.year}</RowTitle>
            <SubtitleRow>
              <SubtitleText>
                <Plur word="show" count={year.showCount} />
              </SubtitleText>
              <SubtitleText>
                <Plur word="tape" count={year.sourceCount} />
              </SubtitleText>
            </SubtitleRow>
          </Flex>
          <FavoriteObjectButton object={year} />
        </Flex>
      </SectionedListItem>
    </Link>
  );
};

const YEAR_FILTERS: Filter<YearFilterKey, Year>[] = [
  {
    persistenceKey: YearFilterKey.Library,
    title: 'My Library',
    active: false,
    filter: (y) => y.isFavorite,
  },
  {
    persistenceKey: YearFilterKey.Downloads,
    title: 'My Downloads',
    active: false,
    // filter: () => true,
    realmFilter: (items) =>
      items.filtered(
        'SUBQUERY(sourceTracks, $item, $item.offlineInfo.status == $0).@count > 0',
        SourceTrackOfflineInfoStatus.Succeeded
      ),
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
];

type YearsListProps = {
  artist: Artist | null;
  years: Realm.Results<Year>;
  filterOptions: FilteringOptions<YearFilterKey>;
} & Omit<FilterableListProps<Year>, 'data' | 'renderItem'>;

const YearsListContainer = (props: YearsListProps) => {
  return (
    <FilteringProvider filters={YEAR_FILTERS} options={props.filterOptions}>
      <YearsList {...props} />
    </FilteringProvider>
  );
};

const YearsList = ({ artist, years, filterOptions, ...props }: YearsListProps) => {
  const { globalFilter } = useFilters();
  const data = useMemo(() => [...globalFilter(years)], [years, globalFilter]);

  return (
    <FilterableList
      ListHeaderComponent={<YearsHeader artist={artist} />}
      data={data}
      renderItem={({ item: year }) => {
        return <YearListItem year={year} />;
      }}
      {...props}
    />
  );
};
