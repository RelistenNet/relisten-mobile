import Realm from 'realm';
import React, { useMemo } from 'react';
import { Show } from '../realm/models/show';
import { SectionedListItem } from './sectioned_list_item';
import { FavoriteObjectButton } from './favorite_icon_button';
import { memo } from '../util/memo';
import RowSubtitle from './row_subtitle';
import Flex from './flex';
import RowTitle from './row_title';
import { RelistenText } from './relisten_text';
import { Filter, FilteringProvider, SortDirection } from './filtering/filters';
import { FilterableList, FilterableListProps } from './filtering/filterable_list';

const ShowListItem: React.FC<{ show: Show; onPress?: (show: Show) => void }> = memo(
  ({ show, onPress }) => {
    return (
      <SectionedListItem onPress={() => onPress && onPress(show)}>
        <Flex className="flex justify-between" full>
          <Flex className="flex-1 pr-2" column>
            <Flex className="items-center" style={{ gap: 8 }}>
              <RowTitle>{show.displayDate}</RowTitle>
              {show.hasSoundboardSource && (
                <RelistenText className="text-xs font-bold text-relisten-blue-600">
                  SBD
                </RelistenText>
              )}
            </Flex>
            {show.venue && (
              <RowSubtitle className="pt-1" numberOfLines={1}>
                {show.venue.name}, {show.venue.location}
              </RowSubtitle>
            )}
            <Flex className="w-full flex-1 justify-between pt-1">
              <RowSubtitle>
                {show.sourceCount} tape(s) &middot; {show.humanizedAvgRating()} ★ &middot;{' '}
                {show.humanizedAvgDuration()}
              </RowSubtitle>
            </Flex>
          </Flex>
          <FavoriteObjectButton object={show} />
        </Flex>
      </SectionedListItem>
    );
  }
);

const SHOW_FILTERS: Filter<Show>[] = [
  { title: 'My Library', active: false, filter: (y) => y.isFavorite },
  {
    title: 'Date',
    sortDirection: SortDirection.Ascending,
    active: true,
    isNumeric: true,
    sort: (years) => years.sort((a, b) => a.displayDate.localeCompare(b.displayDate)),
  },
  {
    title: 'Rating',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (years) => years.sort((a, b) => a.avgRating - b.avgRating),
  },
  {
    title: 'Tapes',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (years) => years.sort((a, b) => a.sourceCount - b.sourceCount),
  },
  {
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
    onItemPress?: (show: Show) => void;
  } & Omit<FilterableListProps<Show>, 'data' | 'renderItem'>
> = ({ shows, onItemPress, ...props }) => {
  const allShows = useMemo(() => {
    return [...shows];
  }, [shows]);

  return (
    <FilteringProvider filters={SHOW_FILTERS}>
      <FilterableList
        data={allShows}
        renderItem={({ item: show }) => {
          return <ShowListItem show={show} onPress={onItemPress} />;
        }}
        {...props}
      />
    </FilteringProvider>
  );
};
