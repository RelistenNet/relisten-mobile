import { ListRenderItem } from '@shopify/flash-list';
import React, { ReactNode, useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Popularity, type PopularitySnapshot } from '../realm/models/popularity';
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
import {
  SectionedListItem,
  type SectionedListItemProps,
  type TouchableOpacityRef,
} from './sectioned_list_item';
import { SourceTrackSucceededIndicator } from './source/source_track_offline_indicator';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import colors from 'tailwindcss/colors';
import { ShowLink } from '@/relisten/util/push_show';
import { PopularityIndicator } from '@/relisten/components/popularity_indicator';
import {
  useLibraryMembershipRevision,
  useRootLibraryIndex,
  useShowHasOfflineTracks,
} from '@/relisten/realm/root_services';
import { useFavorite } from '@/relisten/library/favorite_hooks';
import { showVenueLabel, showVenueLocation, showVenueName } from '@/relisten/util/venue_route';

interface ShowListItemProps {
  show: Show;
  children?: ReactNode;
}

interface ShowListItemViewProps extends ShowListItemProps {
  isTrendingSort: boolean;
  venueLineCount: number;
  popularity?: PopularitySnapshot;
}

/**
 * What a show row prints. A show on the device supplies it through
 * `showRowFields`; a search result builds it from the catalog's response.
 */
export interface ShowRowFields {
  uuid: string;
  displayDate: string;
  hasSoundboardSource: boolean;
  /** 0 when unrated. */
  avgRating: number;
  venueLabel: string;
  sourceCount: number;
  avgDurationLabel?: string;
}

export function showRowFields(show: Show): ShowRowFields {
  return {
    uuid: show.uuid,
    displayDate: show.displayDate,
    hasSoundboardSource: show.hasSoundboardSource,
    avgRating: show.avgRating,
    venueLabel: showVenueLabel(show),
    sourceCount: show.sourceCount,
    avgDurationLabel: show.humanizedAvgDuration(),
  };
}

/**
 * The show row itself, without its link: a show list wraps it in a
 * `ShowLink`, and search passes its own `onPress`. `byline` adds a line for
 * lists that mix artists; `children` adds lines below the venue.
 */
export const ShowRow = React.forwardRef<
  TouchableOpacityRef,
  SectionedListItemProps & {
    fields: ShowRowFields;
    popularity?: PopularitySnapshot | null;
    isTrendingSort?: boolean;
    venueLineCount?: number;
    byline?: string;
    children?: ReactNode;
  }
>(
  (
    {
      fields,
      popularity,
      isTrendingSort = false,
      venueLineCount = 2,
      byline,
      children,
      ...pressable
    },
    ref
  ) => {
    const hasOfflineTracks = useShowHasOfflineTracks(fields.uuid);
    const favorite = useFavorite('show', fields.uuid);

    return (
      <SectionedListItem ref={ref} {...pressable}>
        <Flex className="flex justify-between" full>
          <Flex className="flex-1 pr-2 grow" column>
            <Flex className="items-center flex-wrap" style={{ gap: 8 }}>
              <RowTitle>{fields.displayDate}</RowTitle>
              {fields.hasSoundboardSource && (
                <RelistenText className="text-xs font-bold text-relisten-blue-600">
                  SBD
                </RelistenText>
              )}
              {favorite.isFavorite && (
                <MaterialCommunityIcons name="cards-heart" color={colors.blue['200']} />
              )}
              {hasOfflineTracks && <SourceTrackSucceededIndicator />}
              <View className="grow">
                <Flex className="items-center justify-end">
                  <PopularityIndicator popularity={popularity} isTrendingSort={isTrendingSort} />
                  <SubtitleText>
                    {fields.avgRating != 0 &&
                      '\u00A0\u00A0' + fields.avgRating.toFixed(2) + '\u00A0★'}
                  </SubtitleText>
                </Flex>
              </View>
            </Flex>
            {byline ? <SubtitleText numberOfLines={1}>{byline}</SubtitleText> : null}
            <SubtitleRow className="flex-row">
              <SubtitleText numberOfLines={venueLineCount} className="flex-shrink">
                {fields.venueLabel}
              </SubtitleText>
              <SubtitleText className="text-right pl-2">
                <Plur word="tape" count={fields.sourceCount} />
                {fields.avgDurationLabel ? '\u00A0•\u00A0' + fields.avgDurationLabel : ''}
              </SubtitleText>
            </SubtitleRow>
            {children}
          </Flex>
        </Flex>
      </SectionedListItem>
    );
  }
);

ShowRow.displayName = 'ShowRow';

const ShowListItemView = ({
  show,
  children,
  isTrendingSort,
  venueLineCount,
  popularity,
}: ShowListItemViewProps) => {
  return (
    <ShowLink
      show={{
        artist: show.artist,
        showUuid: show.uuid,
      }}
      asChild
    >
      <ShowRow
        fields={showRowFields(show)}
        popularity={popularity}
        isTrendingSort={isTrendingSort}
        venueLineCount={venueLineCount}
      >
        {children}
      </ShowRow>
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
    <ShowListItemView
      show={show}
      isTrendingSort={isTrendingSort}
      venueLineCount={venueLineCount}
      popularity={show.popularity?.snapshot()}
    >
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

type ShowPopularity = ReadonlyMap<string, PopularitySnapshot | null>;

function showPopularity(show: Show, byShow?: ShowPopularity) {
  return byShow ? byShow.get(show.uuid) : show.popularity;
}

export function useShowFilters(byShow?: ShowPopularity): Filter<ShowFilterKey, Show>[] {
  const libraryIndex = useRootLibraryIndex();
  const libraryMembershipRevision = useLibraryMembershipRevision();

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
              (showPopularity(a, byShow)?.windows?.days30d?.hotScore ?? 0) -
              (showPopularity(b, byShow)?.windows?.days30d?.hotScore ?? 0)
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
            (a, b) =>
              (showPopularity(a, byShow)?.momentumScore ?? 0) -
              (showPopularity(b, byShow)?.momentumScore ?? 0)
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
            searchForSubstring(showVenueName(show), search) ||
            searchForSubstring(showVenueLocation(show), search) ||
            searchForSubstring(show.venue?.pastNames, search) ||
            searchForSubstring(show.artist.name.toLowerCase(), search)
          );
        },
      },
    ];
  }, [byShow, libraryIndex, libraryMembershipRevision]);
}

const DEFAULT_SHOW_FILTER = {
  persistenceKey: ShowFilterKey.Date,
  sortDirection: SortDirection.Ascending,
  active: true,
};

interface ShowListProps {
  filterOptions?: FilteringOptions<ShowFilterKey>;
  ListHeaderComponent?: React.ReactElement;
  popularityByShow?: ShowPopularity;
  renderItem?: ListRenderItem<Show>;
  filters?: Filter<ShowFilterKey, Show>[];
}

export const ShowListContainer = (
  props: ShowListProps & Omit<FilterableListProps<Show>, 'renderItem'>
) => {
  const filters = useShowFilters(props.popularityByShow);

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
  popularityByShow,
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
        popularity={Popularity.snapshot(showPopularity(info.item, popularityByShow))}
      />
    );

    return renderShowListItem;
  }, [isTrendingSort, popularityByShow, venueLineCount]);

  return (
    <FilterableList data={data} renderItem={renderItem || showListRenderItemDefault} {...props} />
  );
};
