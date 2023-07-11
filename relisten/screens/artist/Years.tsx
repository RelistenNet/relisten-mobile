import Realm from 'realm';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { PropsWithChildren, useEffect, useMemo } from 'react';
import { FavoriteObjectButton } from '../../components/favorite_icon_button';
import Flex from '../../components/flex';
import RowSubtitle from '../../components/row_subtitle';
import RowTitle from '../../components/row_title';
import { SectionedListItem } from '../../components/sectioned_list_item';
import { Year } from '../../realm/models/year';
import { AllArtistsTabStackParams } from '../Artist';
import { HomeTabsParamList } from '../Home';
import { useArtistYears } from '../../realm/models/year_repo';
import { memo } from '../../util/memo';
import { RefreshContextProvider } from '../../components/refresh_context';
import { RelistenText } from '../../components/relisten_text';
import { Artist } from '../../realm/models/artist';
import { View } from 'react-native';
import * as R from 'remeda';
import { RelistenButton } from '../../components/relisten_button';
import { Filter, FilteringProvider, SortDirection } from '../../components/filtering/filters';
import { FilterableList, FilterableListProps } from '../../components/filtering/filterable_list';
import { DisappearingHeaderScreen } from '../../components/screens/disappearing_title_screen';

type NavigationProps = NativeStackScreenProps<AllArtistsTabStackParams, 'ArtistYears'>;

export const YearsScreen: React.FC<PropsWithChildren<NavigationProps>> = ({ route }) => {
  const navigation = useNavigation<NavigationProp<HomeTabsParamList>>();
  const { artistUuid } = route.params;

  const results = useArtistYears(artistUuid);
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
        headerHeight={50}
        ScrollableComponent={YearsList}
        artist={artist}
        years={years}
        onItemPress={(year: Year) =>
          navigation.navigate('AllArtistsTab', {
            screen: 'ArtistYearShows',
            params: {
              artistUuid: artist!.uuid,
              yearUuid: year.uuid,
            },
          })
        }
      />
    </RefreshContextProvider>
  );
};

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
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
            Venues
          </RelistenButton>
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

const YearListItem: React.FC<{
  year: Year;
  onPress?: (year: Year) => void;
}> = memo(({ year, onPress }) => {
  return (
    <SectionedListItem onPress={() => onPress && onPress(year)}>
      <Flex className="justify-between" full>
        <Flex column className="flex-1">
          <RowTitle>{year.year}</RowTitle>
          <Flex className="justify-between">
            <RowSubtitle>
              {year.showCount} shows &middot; {year.sourceCount} tapes
            </RowSubtitle>
          </Flex>
        </Flex>
        <FavoriteObjectButton object={year} />
      </Flex>
    </SectionedListItem>
  );
});

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
