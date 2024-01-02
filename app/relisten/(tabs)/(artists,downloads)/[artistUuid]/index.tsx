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
import { Artist } from '@/relisten/realm/models/artist';
import { useArtistMetadata } from '@/relisten/realm/models/artist_repo';
import { Year } from '@/relisten/realm/models/year';
import { useArtistYears, useYearMetadata } from '@/relisten/realm/models/year_repo';
import { useIsDownloadsTab, useRoute } from '@/relisten/util/routes';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Realm from 'realm';
import colors from 'tailwindcss/colors';

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
  const currentRoute = useRoute();
  const router = useRouter();
  const isDownloadsTab = useIsDownloadsTab();
  const metadata = useArtistMetadata(artist);

  if (!artist) {
    return null;
  }

  const goToRandomShow = async () => {
    const randomShow = await apiClient.randomShow(artist.uuid);

    if (randomShow?.data?.uuid) {
      router.push({
        pathname: './[artistUuid]/show/[showUuid]/source/[sourceUuid]/',
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
      {!isDownloadsTab && (
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
  );
};

const YearListItem = ({ year }: { year: Year }) => {
  const nextRoute = useRoute('year/[yearUuid]');
  const metadata = useYearMetadata(year);
  const hasOfflineTracks = (year as any)?.hasOfflineTracks;

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
        <Flex cn="justify-between" full>
          <Flex column cn="flex-1">
            <RowTitle>{year.year}</RowTitle>
            <SubtitleRow>
              <SubtitleText>
                <Plur word="show" count={metadata.shows} />
                {hasOfflineTracks && (
                  <>
                    &nbsp;
                    <MaterialCommunityIcons name="cloud-check" color={colors.gray['400']} />
                  </>
                )}
              </SubtitleText>
              <SubtitleText>
                <Plur word="tape" count={metadata.sources} />
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
