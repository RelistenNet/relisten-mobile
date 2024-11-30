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
import { ShowCard } from '@/relisten/components/show_card';
import { SourceTrackSucceededIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { Artist } from '@/relisten/realm/models/artist';
import { useArtistMetadata } from '@/relisten/realm/models/artist_repo';
import { useTodayShows } from '@/relisten/realm/models/shows/today_shows_repo';
import { Year } from '@/relisten/realm/models/year';
import { useArtistYears, useYearMetadata } from '@/relisten/realm/models/year_repo';
import { useGroupSegment, useIsDownloadedTab, useRoute } from '@/relisten/util/routes';
import { Link, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
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
      headerRight: () => artist && <FavoriteObjectButton object={artist} />,
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
  const currentRoute = useRoute();
  const router = useRouter();
  const isDownloadedTab = useIsDownloadedTab();
  const groupSegment = useGroupSegment(true);
  const metadata = useArtistMetadata(artist);
  const todayShows = useTodayShows(artist?.uuid);

  if (!artist) {
    return null;
  }

  const goToRandomShow = async () => {
    const randomShow = await apiClient.randomShow(artist.uuid);

    if (randomShow?.data?.uuid) {
      router.push({
        pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/`,
        params: {
          artistUuid: artist.uuid,
          showUuid: randomShow!.data!.uuid,
          sourceUuid: 'initial',
        },
      });
    }
  };

  return (
    <>
      <View className="flex w-full items-center pb-1">
        <View className="w-full px-4 pb-2">
          <RelistenText
            className="w-full py-2 text-center text-4xl font-bold text-white"
            selectable={false}
          >
            {artist.name}
          </RelistenText>

          <RelistenText className="text-l w-full pb-2 text-center italic text-gray-400">
            {/* <Plur word="year" count={years.length} /> &middot;&nbsp; */}
            <Plur word="show" count={metadata.shows} /> &middot;&nbsp;
            <Plur word="tape" count={metadata.sources} />
          </RelistenText>
        </View>
        {!isDownloadedTab && (
          <>
            <View className="w-full flex-row px-4 pb-4" style={{ gap: 16 }}>
              <Link
                href={{
                  pathname: currentRoute + '/venues',
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
                  pathname: currentRoute + '/tours',
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
                  pathname: currentRoute + '/songs',
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
                  pathname: currentRoute + '/rated',
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
                  pathname: currentRoute + '/recent',
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
          </>
        )}
      </View>
      <RefreshContextProvider networkBackedResults={todayShows}>
        <View className="flex px-4 pb-2">
          <RelistenText className="text-m font-bold">
            {todayShows.isNetworkLoading && todayShows.data.length == 0 ? (
              <></>
            ) : (
              <>
                <Plur word="show" count={todayShows.data.length} /> on this day
              </>
            )}
          </RelistenText>
        </View>
        {todayShows.isNetworkLoading && todayShows.data.length == 0 ? (
          <View className="mb-1 h-[78px] w-full flex-1 items-start pb-3 pl-3"></View>
        ) : (
          <ScrollView horizontal className="mb-1 pb-3 pl-3">
            {todayShows.data.map((show) => (
              <ShowCard
                show={show}
                key={show.uuid}
                root="artists"
                showArtist={false}
                cn="h-full w-[168px]"
              />
            ))}
          </ScrollView>
        )}
      </RefreshContextProvider>
    </>
  );
};

const YearListItem = ({ year }: { year: Year }) => {
  const nextRoute = useRoute('year/[yearUuid]');
  const metadata = useYearMetadata(year);
  const hasOfflineTracks = year.hasOfflineTracks;

  return (
    <Link
      href={{
        pathname: nextRoute,
        params: {
          artistUuid: year.artistUuid,
          yearUuid: year.uuid,
        },
      }}
      asChild
    >
      <SectionedListItem>
        <Flex cn="justify-between items-center" full>
          <Flex column cn="flex-1">
            <RowTitle>{year.year}</RowTitle>
            <SubtitleRow>
              <SubtitleText>
                <Plur word="show" count={metadata.shows} />
                {hasOfflineTracks && (
                  <>
                    &nbsp;
                    <SourceTrackSucceededIndicator />
                  </>
                )}
              </SubtitleText>
              <SubtitleText>
                <Plur word="tape" count={metadata.sources} />
              </SubtitleText>
            </SubtitleRow>
          </Flex>
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
    filter: (year) => year.hasOfflineTracks,
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
  const data = useMemo(() => {
    return [{ data: [...years] }];
  }, [years]);

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
