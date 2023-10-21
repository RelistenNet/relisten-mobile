import React, { useMemo } from 'react';
import Realm from 'realm';
import { Show } from '../realm/models/show';
import { FavoriteObjectButton } from './favorite_icon_button';
import { FilterableList, FilterableListProps } from './filtering/filterable_list';
import { Filter, FilteringProvider, SortDirection } from './filtering/filters';
import Flex from './flex';
import { RelistenText } from './relisten_text';
import { SubtitleRow, SubtitleText } from './row_subtitle';
import RowTitle from './row_title';
import { SectionedListItem } from './sectioned_list_item';
import Plur from './plur';
import { Link } from 'expo-router';

const ShowListItem = ({ show }: { show: Show }) => {
  return (
    <Link
      href={{
        pathname: '/relisten/(tabs)/artists/[artistUuid]/show/[showUuid]/' as const,
        params: {
          artistUuid: show.artistUuid,
          showUuid: show.uuid,
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

export const ShowList: React.FC<
  {
    shows: Realm.Results<Show>;
    filterPersistenceKey: string;
  } & Omit<FilterableListProps<Show>, 'data' | 'renderItem'>
> = ({ shows, filterPersistenceKey, ...props }) => {
  const allShows = useMemo(() => {
    return [...shows];
  }, [shows]);

  return (
    <FilteringProvider filters={SHOW_FILTERS} filterPersistenceKey={filterPersistenceKey}>
      <FilterableList
        data={allShows}
        renderItem={({ item: show }) => {
          return <ShowListItem show={show} />;
        }}
        {...props}
      />
    </FilteringProvider>
  );
};
