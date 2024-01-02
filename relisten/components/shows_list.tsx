import { ListRenderItem } from '@shopify/flash-list';
import { Link } from 'expo-router';
import React, { ReactNode } from 'react';
import { View } from 'react-native';
import { Artist } from '../realm/models/artist';
import { Show } from '../realm/models/show';
import { useGroupSegment } from '../util/routes';
import { FavoriteObjectButton } from './favorite_icon_button';
import { FilterableList, FilterableListProps } from './filtering/filterable_list';
import { Filter, FilteringOptions, FilteringProvider, SortDirection } from './filtering/filters';
import Flex from './flex';
import Plur from './plur';
import { RelistenText } from './relisten_text';
import { SubtitleRow, SubtitleText } from './row_subtitle';
import RowTitle from './row_title';
import { SectionedListItem } from './sectioned_list_item';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import colors from 'tailwindcss/colors';

interface ShowListItemProps {
  show: Show;
  favoriteButton?: boolean;
  children?: ReactNode;
}

export const ShowListItem = ({ show, favoriteButton, children }: ShowListItemProps) => {
  const groupSegment = useGroupSegment();
  return (
    <Link
      href={{
        pathname: `/relisten/(tabs)/${groupSegment}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/`,
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
              {show?.hasOfflineTracks && (
                <MaterialCommunityIcons name="cloud-check" color={colors.gray['400']} />
              )}
              <View className="grow" />
              <SubtitleText>
                {show.humanizedAvgRating()} ★ &middot; {show.humanizedAvgDuration()}
              </SubtitleText>
            </Flex>
            <SubtitleRow>
              <SubtitleText>
                {show.venue && `${show.venue.name}, ${show.venue.location}`}
                &nbsp;&middot;&nbsp;
                <Plur word="tape" count={show.sourceCount} />
              </SubtitleText>
            </SubtitleRow>
            {children}
          </Flex>
          {favoriteButton && <FavoriteObjectButton object={show} />}
        </Flex>
      </SectionedListItem>
    </Link>
  );
};

export enum ShowFilterKey {
  Library = 'library',
  Downloads = 'downloads',
  Soundboard = 'soundboard',
  Date = 'date',
  Rating = 'rating',
  Tapes = 'tapes',
  Duration = 'duration',
}

const SHOW_FILTERS: Filter<ShowFilterKey, Show>[] = [
  {
    persistenceKey: ShowFilterKey.Soundboard,
    title: 'SBD',
    active: false,
    filter: (show) => show.hasSoundboardSource,
  },
  {
    persistenceKey: ShowFilterKey.Date,
    title: 'Date',
    sortDirection: SortDirection.Ascending,
    active: false,
    isNumeric: true,
    sort: (shows) => shows.sort((a, b) => a.displayDate.localeCompare(b.displayDate)),
  },
  {
    persistenceKey: ShowFilterKey.Rating,
    title: 'Rating',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (shows) => shows.sort((a, b) => a.avgRating - b.avgRating),
  },
  {
    persistenceKey: ShowFilterKey.Tapes,
    title: 'Tapes',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (shows) => shows.sort((a, b) => a.sourceCount - b.sourceCount),
  },
  {
    persistenceKey: ShowFilterKey.Duration,
    title: 'Duration',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (shows) => shows.sort((a, b) => (a.avgDuration || 0) - (b.avgDuration || 0)),
  },
];

const DEFAULT_SHOW_FILTER = {
  persistenceKey: ShowFilterKey.Date,
  sortDirection: SortDirection.Ascending,
  active: true,
};

interface ShowListProps {
  artist: Artist | null;
  filterOptions?: FilteringOptions<ShowFilterKey>;
  ListHeaderComponent?: React.ReactElement;
  renderItem?: ListRenderItem<Show>;
}

const showListRenderItemDefault: ListRenderItem<Show> = ({ item: show }) => {
  return <ShowListItem show={show} />;
};

export const ShowListContainer = (
  props: ShowListProps & Omit<FilterableListProps<Show>, 'renderItem'>
) => {
  return (
    <FilteringProvider
      filters={SHOW_FILTERS}
      options={{ default: DEFAULT_SHOW_FILTER, ...(props.filterOptions || {}) }}
    >
      <ShowList {...props} />
    </FilteringProvider>
  );
};

export const ShowList = ({
  data,
  artist,
  children,
  renderItem,
  filterOptions,
  ...props
}: ShowListProps & Omit<FilterableListProps<Show>, 'renderItem'>) => {
  return (
    <FilterableList data={data} renderItem={renderItem || showListRenderItemDefault} {...props} />
  );
};
