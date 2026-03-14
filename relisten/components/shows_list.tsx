import { ListRenderItem } from '@shopify/flash-list';
import React, { ReactNode, useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Show } from '../realm/models/show';
import { FilterableList, FilterableListProps } from './filtering/filterable_list';
import {
  Filter,
  FilteringOptions,
  FilteringProvider,
  searchForSubstring,
  SortDirection,
  useFilters,
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
import { PopularityIndicator } from '@/relisten/components/popularity_indicator';
import { useLibraryMembershipIndex, useShowHasOfflineTracks } from '@/relisten/realm/root_services';

interface ShowListItemProps {
  show: Show;
  children?: ReactNode;
}

interface ShowListItemViewProps extends ShowListItemProps {
  isTrendingSort: boolean;
  venueLineCount: number;
}

const ShowListItemView = ({
  show,
  children,
  isTrendingSort,
  venueLineCount,
}: ShowListItemViewProps) => {
  const hasOfflineTracks = useShowHasOfflineTracks(show.uuid);

  return (
    <ShowLink
      show={{
        artist: show.artist,
        showUuid: show.uuid,
      }}
      asChild
    >
      <SectionedListItem>
        <Flex className="flex justify-between" full>
          <Flex className="flex-1 pr-2 grow" column>
            <Flex className="items-center flex-wrap" style={{ gap: 8 }}>
              <RowTitle>{show.displayDate}</RowTitle>
              {show.hasSoundboardSource && (
                <RelistenText className="text-xs font-bold text-relisten-blue-600">
                  SBD
                </RelistenText>
              )}
              {show?.isFavorite && (
                <MaterialCommunityIcons name="cards-heart" color={colors.blue['200']} />
              )}
              {hasOfflineTracks && <SourceTrackSucceededIndicator />}
              <View className="grow">
                <Flex className="items-center justify-end">
                  <PopularityIndicator
                    popularity={show.popularity?.snapshot()}
                    isTrendingSort={isTrendingSort}
                  />
                  <SubtitleText>
                    {show.avgRating != 0 && '\u00A0\u00A0' + show.humanizedAvgRating() + '\u00A0★'}
                  </SubtitleText>
                </Flex>
              </View>
            </Flex>
            <SubtitleRow className="flex-row flex-1">
              <SubtitleText numberOfLines={venueLineCount} className="flex-shrink">
                {show.venue && `${show.venue.name}, ${show.venue.location}`}
              </SubtitleText>
              <SubtitleText className="text-right pl-2">
                <Plur word="tape" count={show.sourceCount} />
                {'\u00A0•\u00A0' + show.humanizedAvgDuration()}
              </SubtitleText>
            </SubtitleRow>
            {children}
          </Flex>
        </Flex>
      </SectionedListItem>
    </ShowLink>
  );
};

export const ShowListItem = ({ show, children }: ShowListItemProps) => {
  const { fontScale } = useWindowDimensions();
  const { filters } = useFilters<ShowFilterKey, Show>();
  const isTrendingSort = filters.some(
    (filter) => filter.active && filter.persistenceKey === ShowFilterKey.Trending
  );
  const venueLineCount = fontScale > 1.5 ? 3 : 2;

  return (
    <ShowListItemView show={show} isTrendingSort={isTrendingSort} venueLineCount={venueLineCount}>
      {children}
    </ShowListItemView>
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

export function useShowFilters(): Filter<ShowFilterKey, Show>[] {
  const libraryIndex = useLibraryMembershipIndex();

  return useMemo(() => {
    return [
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
        filter: (show) => libraryIndex.showIsInLibrary(show.uuid),
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
          shows.sort(
            (a, b) => (a.popularity?.momentumScore ?? 0) - (b.popularity?.momentumScore ?? 0)
          ),
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
  }, [libraryIndex]);
}

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

export const ShowListContainer = (
  props: ShowListProps & Omit<FilterableListProps<Show>, 'renderItem'>
) => {
  const filters = useShowFilters();

  return (
    <FilteringProvider
      filters={props.filters ?? filters}
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
  const { fontScale } = useWindowDimensions();
  const { filters } = useFilters<ShowFilterKey, Show>();
  const isTrendingSort = filters.some(
    (filter) => filter.active && filter.persistenceKey === ShowFilterKey.Trending
  );
  const venueLineCount = fontScale > 1.5 ? 3 : 2;
  const showListRenderItemDefault = useMemo<ListRenderItem<Show>>(() => {
    const renderShowListItem: ListRenderItem<Show> = (info) => (
      <ShowListItemView
        show={info.item}
        isTrendingSort={isTrendingSort}
        venueLineCount={venueLineCount}
      />
    );

    return renderShowListItem;
  }, [isTrendingSort, venueLineCount]);

  return (
    <FilterableList data={data} renderItem={renderItem || showListRenderItemDefault} {...props} />
  );
};
