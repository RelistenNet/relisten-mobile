import { FavoriteTargetButton } from '@/relisten/components/favorite_icon_button';
import {
  Filter,
  FilteringProvider,
  searchForSubstring,
  SortDirection,
} from '@/relisten/components/filtering/filters';
import {
  FilterableList,
  FilterableListProps,
} from '@/relisten/components/filtering/filterable_list';
import Flex from '@/relisten/components/flex';
import Plur from '@/relisten/components/plur';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import {
  normalizedVenueAliases,
  normalizedVenueLocation,
} from '@/relisten/components/venue_presenters';
import { NormalizedVenue } from '@/relisten/realm/models/v4_catalog';
import { useFavoriteCatalogUuids } from '@/relisten/realm/root_services';
import { useQuery } from '@/relisten/realm/schema';
import { useGroupSegment } from '@/relisten/util/routes';
import { Link, useNavigation } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';

interface LibraryVenueItem {
  uuid: string;
  venue?: NormalizedVenue;
}

enum LibraryVenueFilterKey {
  Name = 'name',
  Shows = 'shows',
  Search = 'search',
}

const filters: Filter<LibraryVenueFilterKey, LibraryVenueItem>[] = [
  {
    persistenceKey: LibraryVenueFilterKey.Name,
    title: 'Name',
    sortDirection: SortDirection.Ascending,
    active: true,
    sort: (items) =>
      items.sort((a, b) => (a.venue?.name ?? a.uuid).localeCompare(b.venue?.name ?? b.uuid)),
  },
  {
    persistenceKey: LibraryVenueFilterKey.Shows,
    title: '# of Shows',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (items) =>
      items.sort((a, b) => (a.venue?.globalShowCount ?? -1) - (b.venue?.globalShowCount ?? -1)),
  },
  {
    persistenceKey: LibraryVenueFilterKey.Search,
    title: 'Search',
    active: false,
    searchFilter: (item, searchText) => {
      const search = searchText.toLowerCase();
      return (
        searchForSubstring(item.venue?.name, search) ||
        searchForSubstring(normalizedVenueLocation(item.venue), search) ||
        searchForSubstring(normalizedVenueAliases(item.venue), search) ||
        searchForSubstring(item.uuid, search)
      );
    },
  },
];

function LibraryVenueRow({ item }: { item: LibraryVenueItem }) {
  const groupSegment = useGroupSegment();
  const location = normalizedVenueLocation(item.venue);
  const content = (
    <SectionedListItem>
      <Flex className="items-center justify-between" full>
        <Flex className="min-w-0 flex-1 pr-3" column>
          <RowTitle>{item.venue?.name ?? 'Venue unavailable'}</RowTitle>
          <SubtitleRow>
            <SubtitleText>{item.venue ? location : item.uuid}</SubtitleText>
            {item.venue && (
              <SubtitleText>
                <Plur word="show" count={item.venue.globalShowCount} />
              </SubtitleText>
            )}
          </SubtitleRow>
        </Flex>
        <FavoriteTargetButton targetKind="venue" catalogId={item.uuid} />
      </Flex>
    </SectionedListItem>
  );

  if (!item.venue) return content;

  return (
    <Link
      href={{
        pathname: `/relisten/tabs/${groupSegment}/venue/[venueId]/` as const,
        params: { venueId: item.uuid },
      }}
      asChild
    >
      {content}
    </Link>
  );
}

function LibraryVenueList({
  venues,
  ...props
}: { venues: LibraryVenueItem[] } & Omit<
  FilterableListProps<LibraryVenueItem>,
  'data' | 'renderItem'
>) {
  return (
    <FilteringProvider filters={filters} options={{ persistence: { key: 'myLibrary/venues' } }}>
      <FilterableList
        {...props}
        data={[{ data: venues }]}
        renderItem={({ item }) => <LibraryVenueRow item={item} />}
        ListHeaderComponent={
          <View className="w-full py-2">
            <RelistenText
              className="w-full text-center text-4xl font-bold text-white"
              selectable={false}
            >
              Venues
            </RelistenText>
            <RelistenText className="text-l w-full text-center italic text-gray-400">
              <Plur word="venue" count={venues.length} /> in My Library
            </RelistenText>
          </View>
        }
        nonIdealState={{
          noData: {
            title: 'No Venues in My Library',
            description: 'Tap the heart on a venue to add it here.',
          },
        }}
      />
    </FilteringProvider>
  );
}

export default function LibraryVenuesPage() {
  const navigation = useNavigation();
  const favoriteVenueIds = useFavoriteCatalogUuids('venue');
  const normalizedVenues = useQuery(NormalizedVenue);
  const venues = useMemo(() => {
    const venuesById = new Map([...normalizedVenues].map((venue) => [venue.id, venue]));
    return [...favoriteVenueIds].map((id) => ({
      uuid: id,
      venue: venuesById.get(id),
    }));
  }, [favoriteVenueIds, normalizedVenues]);

  useEffect(() => {
    navigation.setOptions({ title: 'My Venues' });
  }, [navigation]);

  return <DisappearingHeaderScreen ScrollableComponent={LibraryVenueList} venues={venues} />;
}
