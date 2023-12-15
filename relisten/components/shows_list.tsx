import { Link } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import Realm from 'realm';
import * as R from 'remeda';
import { Artist } from '../realm/models/artist';
import { Show } from '../realm/models/show';
import { Year } from '../realm/models/year';
import { FavoriteObjectButton } from './favorite_icon_button';
import { FilterableList, FilterableListProps } from './filtering/filterable_list';
import { Filter, FilteringProvider, SortDirection } from './filtering/filters';
import Flex from './flex';
import Plur from './plur';
import { RelistenText } from './relisten_text';
import { SubtitleRow, SubtitleText } from './row_subtitle';
import RowTitle from './row_title';
import { SectionedListItem } from './sectioned_list_item';

const ShowListItem = ({ show }: { show: Show }) => {
  return (
    <Link
      href={{
        pathname:
          '/relisten/(tabs)/artists/[artistUuid]/show/[showUuid]/source/[sourceUuid]/' as const,
        params: {
          artistUuid: show.artistUuid,
          showUuid: show.uuid,
          sourceUuid: 'initial',
        },
      }}
      asChild
    >
      <SectionedListItem>
        <Flex cn="flex justify-between" full>
          <Flex cn="flex-1 pr-2" column>
            <Flex cn="items-center" style={{ gap: 8 }}>
              <RowTitle>{show.displayDate}</RowTitle>
              {show.hasSoundboardSource && (
                <RelistenText cn="text-xs font-bold text-relisten-blue-600">SBD</RelistenText>
              )}
            </Flex>
            <SubtitleRow>
              <SubtitleText>
                {show.venue && `${show.venue.name}, ${show.venue.location} · `}
                <Plur word="tape" count={show.sourceCount} /> &middot; {show.humanizedAvgRating()} ★
                &middot; {show.humanizedAvgDuration()}
              </SubtitleText>
            </SubtitleRow>
          </Flex>
          <FavoriteObjectButton object={show} />
        </Flex>
      </SectionedListItem>
    </Link>
  );
};

const SHOW_FILTERS: Filter<Show>[] = [
  { persistenceKey: 'library', title: 'My Library', active: false, filter: (y) => y.isFavorite },
  {
    persistenceKey: 'soundboard',
    title: 'SBD',
    active: false,
    filter: (y) => y.hasSoundboardSource,
  },
  {
    persistenceKey: 'date',
    title: 'Date',
    sortDirection: SortDirection.Ascending,
    active: true,
    isNumeric: true,
    sort: (years) => years.sort((a, b) => a.displayDate.localeCompare(b.displayDate)),
  },
  {
    persistenceKey: 'rating',
    title: 'Rating',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (years) => years.sort((a, b) => a.avgRating - b.avgRating),
  },
  {
    persistenceKey: 'tapes',
    title: 'Tapes',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (years) => years.sort((a, b) => a.sourceCount - b.sourceCount),
  },
  {
    persistenceKey: 'duration',
    title: 'Duration',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (years) => years.sort((a, b) => (a.avgDuration || 0) - (b.avgDuration || 0)),
  },
];

const YearHeader = ({
  shows,
  year,
}: {
  artist: Artist | null;
  shows: ReadonlyArray<Show>;
  year: Year | null;
}) => {
  if (shows.length === 0) {
    return null;
  }

  const totalShows = shows?.length;
  const totalTapes = R.sumBy(shows, (y) => y.sourceCount);

  return (
    <View className="flex w-full flex-col items-center gap-1 py-2">
      <RelistenText className="w-full text-center text-4xl font-bold text-white" selectable={false}>
        {year?.year}
      </RelistenText>

      <RelistenText className="text-l w-full text-center italic text-gray-400">
        <Plur word="show" count={totalShows} /> &middot;&nbsp;
        <Plur word="tape" count={totalTapes} />
      </RelistenText>
    </View>
  );
};
interface ShowListProps {
  shows: Realm.Results<Show>;
  artist: Artist | null;
  year: Year | null;
  filterPersistenceKey: string;
}

export const ShowList = ({
  shows,
  artist,
  year,
  filterPersistenceKey,
  ...props
}: ShowListProps & Omit<FilterableListProps<Show>, 'data' | 'renderItem'>) => {
  const allShows = useMemo(() => {
    return [...shows];
  }, [shows]);

  return (
    <FilteringProvider filters={SHOW_FILTERS} filterPersistenceKey={filterPersistenceKey}>
      <FilterableList
        ListHeaderComponent={<YearHeader artist={artist} shows={allShows} year={year} />}
        data={allShows}
        renderItem={({ item: show }) => {
          return <ShowListItem show={show} />;
        }}
        {...props}
      />
    </FilteringProvider>
  );
};
