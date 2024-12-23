import Flex from '@/relisten/components/flex';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Venue } from '@/relisten/realm/models/venue';
import { useArtistVenues } from '@/relisten/realm/models/venue_repo';
import { Link, useLocalSearchParams, useNavigation } from 'expo-router';
import {
  FilterableList,
  FilterableListProps,
} from '@/relisten/components/filtering/filterable_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import Plur from '@/relisten/components/plur';
import {
  Filter,
  FilteringOptions,
  FilteringProvider,
  SortDirection,
} from '@/relisten/components/filtering/filters';
import { useEffect } from 'react';
import { useGroupSegment } from '@/relisten/util/routes';
import { SongFilterPersistenceKey } from '@/app/relisten/tabs/(artists,myLibrary)/[artistUuid]/songs';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid } = useLocalSearchParams();
  const results = useArtistVenues(String(artistUuid));
  const { data } = results;

  useEffect(() => {
    navigation.setOptions({
      title: 'Venues',
    });
  }, []);

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        ScrollableComponent={VenueList}
        venues={Array.from(data.venues)}
        filterOptions={{ persistence: { key: ['artists', artistUuid, 'venues'].join('/') } }}
      />
    </RefreshContextProvider>
  );
}

interface VenueListItemProps {
  venue: Venue;
}

const VenueListItem = ({ venue }: VenueListItemProps) => {
  const groupSegment = useGroupSegment(true);

  return (
    <Link
      href={{
        pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/venue/[venueUuid]/` as const,
        params: {
          artistUuid: venue.artistUuid,
          venueUuid: venue.uuid,
        },
      }}
      asChild
    >
      <SectionedListItem>
        <Flex column>
          <RowTitle>{venue.name}</RowTitle>
          <SubtitleRow>
            <SubtitleText>{venue.location}</SubtitleText>
            <SubtitleText>
              <Plur word="show" count={venue.showsAtVenue} />
            </SubtitleText>
          </SubtitleRow>
        </Flex>
      </SectionedListItem>
    </Link>
  );
};

interface VenueHeaderProps {
  venues: Venue[];
}

const VenueHeader = ({ venues }: VenueHeaderProps) => {
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
};

export enum VenueFilterKey {
  Library = 'library',
  Name = 'name',
  Shows = 'shows',
  Search = 'search',
}

const VENUE_FILTERS: Filter<VenueFilterKey, Venue>[] = [
  {
    persistenceKey: VenueFilterKey.Library,
    title: 'My Library',
    active: false,
    filter: (y) => y.isFavorite,
  },
  {
    persistenceKey: VenueFilterKey.Name,
    title: 'Name',
    sortDirection: SortDirection.Ascending,
    active: true,
    isNumeric: false,
    sort: (venues) => venues.sort((a, b) => a.name.localeCompare(b.name)),
  },
  {
    persistenceKey: VenueFilterKey.Shows,
    title: '# of Shows',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (venues) => venues.sort((a, b) => a.showsAtVenue - b.showsAtVenue),
  },
  {
    persistenceKey: VenueFilterKey.Search,
    title: 'Search',
    active: false,
    searchFilter: (venue, searchText) => {
      const search = searchText.toLowerCase();

      return (
        venue.name.toLowerCase().indexOf(search) !== -1 ||
        venue.location.toLowerCase().indexOf(search) !== -1 ||
        venue.pastNames?.toLowerCase()?.indexOf(search) !== -1
      );
    },
  },
];

interface VenueListProps {
  venues: Venue[];
  filterOptions: FilteringOptions<VenueFilterKey>;
}

const VenueList = ({
  venues,
  filterOptions,
}: VenueListProps & Omit<FilterableListProps<Venue>, 'data' | 'renderItem'>) => {
  return (
    <FilteringProvider filters={VENUE_FILTERS} options={filterOptions}>
      <FilterableList
        ListHeaderComponent={<VenueHeader venues={venues} />}
        data={[{ data: venues }]}
        renderItem={({ item }) => {
          return <VenueListItem venue={item} />;
        }}
      />
    </FilteringProvider>
  );
};
