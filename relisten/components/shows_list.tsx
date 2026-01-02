import { ListRenderItem } from '@shopify/flash-list';
import React, { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Show } from '../realm/models/show';
import { FilterableList, FilterableListProps } from './filtering/filterable_list';
import {
  Filter,
  FilteringOptions,
  FilteringProvider,
  searchForSubstring,
  SortDirection,
} from './filtering/filters';
import Flex from './flex';
import Plur from './plur';
import { RelistenText } from './relisten_text';
import { SubtitleRow, SubtitleText } from './row_subtitle';
import RowTitle from './row_title';
import { SectionedListItem } from './sectioned_list_item';
import { SourceTrackSucceededIndicator } from './source/source_track_offline_indicator';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import colors from 'tailwindcss/colors';
import { ShowLink } from '@/relisten/util/push_show';

interface ShowListItemProps {
  show: Show;
  children?: ReactNode;
}

export const ShowListItem = ({ show, children }: ShowListItemProps) => {
  const { fontScale } = useWindowDimensions();

  return (
    <ShowLink
      show={{
        artist: show.artist,
        showUuid: show.uuid,
      }}
      asChild
    >
      <SectionedListItem>
        <Flex cn="flex justify-between" full>
          <Flex cn="flex-1 pr-2" column>
            <Flex cn="items-center flex-wrap" style={{ gap: 8 }}>
              <RowTitle>{show.displayDate}</RowTitle>
              {show.hasSoundboardSource && (
                <RelistenText cn="text-xs font-bold text-relisten-blue-600">SBD</RelistenText>
              )}
              {show?.isFavorite && (
                <MaterialCommunityIcons name="cards-heart" color={colors.blue['200']} />
              )}
              {show?.hasOfflineTracks && <SourceTrackSucceededIndicator />}
              <View className="grow" />
              <SubtitleText>
                {show.avgRating != 0 && show.humanizedAvgRating() + '\u00A0★\u00A0•\u00A0'}
                {show.humanizedAvgDuration()}
              </SubtitleText>
            </Flex>
            <SubtitleRow>
              <SubtitleText numberOfLines={fontScale > 1.5 ? 3 : 2}>
                {show.venue && `${show.venue.name}, ${show.venue.location}\u00A0•\u00A0`}
                <Plur word="tape" count={show.sourceCount} />
              </SubtitleText>
            </SubtitleRow>
            {children}
          </Flex>
        </Flex>
      </SectionedListItem>
    </ShowLink>
  );
};

export enum ShowFilterKey {
  Library = 'library',
  Downloads = 'downloads',
  Soundboard = 'soundboard',
  PlayableOffline = 'playableOffline',
  Date = 'date',
  Popular = 'popular',
  Trending = 'trending',
  Rating = 'rating',
  Tapes = 'tapes',
  Duration = 'duration',
  Search = 'search',
}

export const SHOW_FILTERS: Filter<ShowFilterKey, Show>[] = [
  {
    persistenceKey: ShowFilterKey.Soundboard,
    title: 'SBD',
    active: false,
    filter: (show) => show.hasSoundboardSource,
  },
  {
    persistenceKey: ShowFilterKey.Library,
    title: 'My Library',
    active: false,
    filter: (show) => show.hasOfflineTracks || show.isFavorite,
    isGlobal: true,
  },
  {
    persistenceKey: ShowFilterKey.Date,
    title: 'Date',
    sortDirection: SortDirection.Ascending,
    active: true,
    isNumeric: true,
    sort: (shows) => shows.sort((a, b) => a.displayDate.localeCompare(b.displayDate)),
  },
  {
    persistenceKey: ShowFilterKey.Popular,
    title: 'Popular',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (shows) =>
      shows.sort(
        (a, b) =>
          (a.popularity?.windows?.days30d?.hotScore ?? 0) -
          (b.popularity?.windows?.days30d?.hotScore ?? 0)
      ),
  },
  {
    persistenceKey: ShowFilterKey.Trending,
    title: 'Trending',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (shows) =>
      shows.sort((a, b) => (a.popularity?.momentumScore ?? 0) - (b.popularity?.momentumScore ?? 0)),
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
  {
    persistenceKey: ShowFilterKey.Search,
    title: 'Search',
    active: false,
    searchFilter: (show, searchText) => {
      const search = searchText.toLowerCase();

      return (
        searchForSubstring(show.displayDate, search) ||
        searchForSubstring(show.venue?.name, search) ||
        searchForSubstring(show.venue?.location, search) ||
        searchForSubstring(show.venue?.pastNames, search) ||
        searchForSubstring(show.artist.name.toLowerCase(), search)
      );
    },
  },
];

const DEFAULT_SHOW_FILTER = {
  persistenceKey: ShowFilterKey.Date,
  sortDirection: SortDirection.Ascending,
  active: true,
};

interface ShowListProps {
  filterOptions?: FilteringOptions<ShowFilterKey>;
  ListHeaderComponent?: React.ReactElement;
  renderItem?: ListRenderItem<Show>;
  filters?: Filter<ShowFilterKey, Show>[];
}

const showListRenderItemDefault: ListRenderItem<Show> = ({ item: show }) => {
  return <ShowListItem show={show} />;
};

export const ShowListContainer = (
  props: ShowListProps & Omit<FilterableListProps<Show>, 'renderItem'>
) => {
  return (
    <FilteringProvider
      filters={props.filters ?? SHOW_FILTERS}
      options={{ default: DEFAULT_SHOW_FILTER, ...(props.filterOptions || {}) }}
    >
      <ShowList {...props} />
    </FilteringProvider>
  );
};

export const ShowList = ({
  data,
  renderItem,
  ...props
}: ShowListProps & Omit<FilterableListProps<Show>, 'renderItem'>) => {
  return (
    <FilterableList data={data} renderItem={renderItem || showListRenderItemDefault} {...props} />
  );
};
