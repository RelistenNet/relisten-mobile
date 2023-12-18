import { useRelistenApi } from '@/relisten/api/context';
import { FavoriteObjectButton } from '@/relisten/components/favorite_icon_button';
import {
  FilterableList,
  FilterableListProps,
} from '@/relisten/components/filtering/filterable_list';
import { Filter, FilteringProvider, SortDirection } from '@/relisten/components/filtering/filters';
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
import { Year } from '@/relisten/realm/models/year';
import { useArtistYears } from '@/relisten/realm/models/year_repo';
import { Link, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Realm from 'realm';

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
        ScrollableComponent={YearsList}
        artist={artist}
        years={years}
        filterPersistenceKey={['artists', artistUuid, 'years'].join('/')}
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

const YEAR_FILTERS: Filter<Year>[] = [
  { persistenceKey: 'library', title: 'My Library', active: false, filter: (y) => y.isFavorite },
  {
    persistenceKey: 'year',
    title: 'Date',
    sortDirection: SortDirection.Ascending,
    active: true,
    isNumeric: true,
    sort: (years) => years.sort((a, b) => a.year.localeCompare(b.year)),
  },
  {
    persistenceKey: 'shows',
    title: 'Shows',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (years) => years.sort((a, b) => a.showCount - b.showCount),
  },
  {
    persistenceKey: 'tapes',
    title: 'Tapes',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (years) => years.sort((a, b) => a.sourceCount - b.sourceCount),
  },
];

const YearsList: React.FC<
  {
    artist: Artist | null;
    years: Realm.Results<Year>;
    filterPersistenceKey: string;
  } & Omit<FilterableListProps<Year>, 'data' | 'renderItem'>
> = ({ artist, years, filterPersistenceKey, ...props }) => {
  const allYears = useMemo(() => {
    return [...years];
  }, [years]);

  return (
    <FilteringProvider filters={YEAR_FILTERS} filterPersistenceKey={filterPersistenceKey}>
      <FilterableList
        ListHeaderComponent={<YearsHeader artist={artist} />}
        data={allYears}
        renderItem={({ item: year }) => {
          return <YearListItem year={year} />;
        }}
        {...props}
      />
    </FilteringProvider>
  );
};
