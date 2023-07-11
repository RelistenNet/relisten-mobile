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
import { memo } from '@/relisten/util/memo';
import { Link, useGlobalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Realm from 'realm';
import * as R from 'remeda';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid } = useGlobalSearchParams();

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
      <Link
        href={{
          pathname: '/artists/[artistUuid]',
          params: {
            artistUuid: artist?.uuid,
          },
        }}
        asChild
      >
        <DisappearingHeaderScreen
          headerHeight={50}
          ScrollableComponent={YearsList}
          artist={artist}
          years={years}
        />
      </Link>
    </RefreshContextProvider>
  );
}

const YearsHeader: React.FC<{ artist: Artist | null; years: ReadonlyArray<Year> }> = memo(
  ({ artist, years }) => {
    if (!artist || years.length === 0) {
      return null;
    }

    const totalShows = R.sumBy(years, (y) => y.showCount);
    const totalTapes = R.sumBy(years, (y) => y.sourceCount);

    return (
      <View className="flex w-full items-center pb-1">
        <View className="w-full px-4 pb-4">
          <RelistenText
            className="w-full py-2 text-center text-4xl font-bold text-white"
            selectable={false}
          >
            {artist.name}
          </RelistenText>
          <RelistenText className="w-full pb-2 text-center text-xl" selectable={false}>
            {years[0].year}&ndash;{years[years.length - 1].year}
          </RelistenText>
          <RelistenText className="text-l w-full pb-2 text-center italic text-slate-400">
            {[years.length + ' years', totalShows + ' shows', totalTapes + ' tapes'].join(' • ')}
          </RelistenText>
        </View>
        <View className="w-full flex-row px-4 pb-4" style={{ gap: 16 }}>
          <Link
            href={{
              pathname: '/artists/[artistUuid]/venues',
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
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
            Tours
          </RelistenButton>
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
            Songs
          </RelistenButton>
        </View>
        <View className="w-full flex-row px-4 pb-4" style={{ gap: 16 }}>
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
            Top Rated
          </RelistenButton>
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
            Popular
          </RelistenButton>
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
            Random
          </RelistenButton>
        </View>
      </View>
    );
  }
);

const YearListItem = ({ year }: { year: Year }) => {
  return (
    <Link
      href={{
        pathname: 'artists/[artistUuid]/[yearUuid]',
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
  { title: 'My Library', active: false, filter: (y) => y.isFavorite },
  {
    title: 'Year',
    sortDirection: SortDirection.Ascending,
    active: true,
    isNumeric: true,
    sort: (years) => years.sort((a, b) => a.year.localeCompare(b.year)),
  },
  {
    title: 'Shows',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (years) => years.sort((a, b) => a.showCount - b.showCount),
  },
  {
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
    onItemPress?: (year: Year) => void;
  } & Omit<FilterableListProps<Year>, 'data' | 'renderItem'>
> = ({ artist, years, onItemPress, ...props }) => {
  const allYears = useMemo(() => {
    return [...years];
  }, [years]);

  return (
    <FilteringProvider filters={YEAR_FILTERS}>
      <FilterableList
        ListHeaderComponent={<YearsHeader artist={artist} years={years} />}
        data={allYears}
        renderItem={({ item: year }) => {
          return <YearListItem year={year} onPress={onItemPress} />;
        }}
        {...props}
      />
    </FilteringProvider>
  );
};
