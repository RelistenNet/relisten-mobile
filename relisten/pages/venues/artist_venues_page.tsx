import type { VenueItem } from '@/relisten/realm/models/venue_view';
import { FavoriteTargetButton } from '@/relisten/components/favorite_icon_button';
import {
  Filter,
  FilteringOptions,
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
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { useLibraryMembershipRevision, useRootLibraryIndex } from '@/relisten/realm/root_services';
import { useArtistVenues } from '@/relisten/realm/models/venue_repo';
import { useGroupSegment } from '@/relisten/util/routes';
import { Link, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo } from 'react';

function itemName(item: VenueItem) {
  return item.name || 'Unknown venue';
}
function itemLocation(item: VenueItem) {
  return item.location;
}
function itemShowCount(item: VenueItem) {
  return item.showCount;
}

function VenueListItem({ item }: { item: VenueItem }) {
  const groupSegment = useGroupSegment();

  return (
    <Link
      href={{
        pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/venue/[venueUuid]/` as const,
        params: {
          artistUuid: item.artistUuid!,
          venueUuid: item.uuid,
        },
      }}
      asChild
    >
      <SectionedListItem>
        <Flex className="items-center justify-between" full>
          <Flex className="min-w-0 flex-1 pr-3" column>
            <RowTitle>{itemName(item)}</RowTitle>
            <SubtitleRow>
              {!!itemLocation(item) && <SubtitleText>{itemLocation(item)}</SubtitleText>}
              <SubtitleText>
                <Plur word="show" count={itemShowCount(item)} />
              </SubtitleText>
            </SubtitleRow>
          </Flex>
          <FavoriteTargetButton {...item.favorite} />
        </Flex>
      </SectionedListItem>
    </Link>
  );
}

function VenueHeader({ venues }: { venues: VenueItem[] }) {
  return (
    <>
      <RelistenText
        className="w-full py-2 text-center text-4xl font-bold text-white"
        selectable={false}
      >
        Venues
      </RelistenText>
      <RelistenText className="text-l w-full pb-2 text-center italic text-gray-400">
        <Plur word="Location" count={venues.length} />
      </RelistenText>
    </>
  );
}

enum VenueFilterKey {
  Library = 'library',
  Name = 'name',
  Shows = 'shows',
  Search = 'search',
}

function venueFilters(
  isFavorite: (item: VenueItem) => boolean
): Filter<VenueFilterKey, VenueItem>[] {
  return [
    {
      persistenceKey: VenueFilterKey.Library,
      title: 'My Library',
      active: false,
      filter: isFavorite,
    },
    {
      persistenceKey: VenueFilterKey.Name,
      title: 'Name',
      sortDirection: SortDirection.Ascending,
      active: false,
      isNumeric: false,
      sort: (venues) => venues.sort((a, b) => itemName(a).localeCompare(itemName(b))),
    },
    {
      persistenceKey: VenueFilterKey.Shows,
      title: '# of Shows',
      sortDirection: SortDirection.Descending,
      active: false,
      isNumeric: true,
      sort: (venues) => venues.sort((a, b) => itemShowCount(a) - itemShowCount(b)),
    },
    {
      persistenceKey: VenueFilterKey.Search,
      title: 'Search',
      active: false,
      searchFilter: (item, searchText) => {
        const search = searchText.toLowerCase();
        return (
          searchForSubstring(itemName(item), search) ||
          searchForSubstring(itemLocation(item), search) ||
          searchForSubstring(item.aliases, search)
        );
      },
    },
  ];
}

interface VenueListProps {
  venues: VenueItem[];
  filterOptions: FilteringOptions<VenueFilterKey>;
}

function VenueList({
  venues,
  filterOptions,
  ...props
}: VenueListProps & Omit<FilterableListProps<VenueItem>, 'data' | 'renderItem'>) {
  const libraryIndex = useRootLibraryIndex();
  const libraryMembershipRevision = useLibraryMembershipRevision();
  const filters = useMemo(
    () =>
      venueFilters((item) =>
        libraryIndex.isFavorite(item.favorite.targetKind, item.favorite.catalogId)
      ),
    [libraryIndex, libraryMembershipRevision]
  );

  return (
    <FilteringProvider filters={filters} options={filterOptions}>
      <FilterableList
        {...props}
        ListHeaderComponent={<VenueHeader venues={venues} />}
        data={[{ data: venues }]}
        renderItem={({ item }) => <VenueListItem item={item} />}
        nonIdealState={{
          noData: {
            title: 'No Venues',
            description: 'No venue information is available for this artist.',
          },
        }}
      />
    </FilteringProvider>
  );
}

export default function ArtistVenuesPage() {
  const navigation = useNavigation();
  const { artistUuid } = useLocalSearchParams<{ artistUuid: string }>();
  const results = useArtistVenues(String(artistUuid));
  const venues = [...results.data.venues];

  useEffect(() => {
    navigation.setOptions({ title: 'Venues' });
  }, [navigation]);

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        ScrollableComponent={VenueList}
        venues={venues}
        filterOptions={{
          persistence: { key: ['artists', artistUuid, 'venues'].join('/') },
        }}
      />
    </RefreshContextProvider>
  );
}
