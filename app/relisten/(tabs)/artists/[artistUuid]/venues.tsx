import Flex from '@/relisten/components/flex';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Venue } from '@/relisten/realm/models/venue';
import { useArtistVenues } from '@/relisten/realm/models/venue_repo';
import { useLocalSearchParams } from 'expo-router';
import {
  FilterableList,
  FilterableListProps,
} from '@/relisten/components/filtering/filterable_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import Plur from '@/relisten/components/plur';
import { FilteringProvider, Filter, SortDirection } from '@/relisten/components/filtering/filters';
import { useHeaderHeight } from '@react-navigation/elements';

export default function Page() {
  const { artistUuid } = useLocalSearchParams();
  const results = useArtistVenues(String(artistUuid));
  const { data } = results;
  const headerHeight = useHeaderHeight();

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        headerHeight={headerHeight}
        ScrollableComponent={VenueList}
        venues={Array.from(data.venues)}
        filterPersistenceKey={['artists', artistUuid, 'venues'].join('/')}
      />
    </RefreshContextProvider>
  );
}

interface VenueListItemProps {
  venue: Venue;
}

const VenueListItem = ({ venue }: VenueListItemProps) => {
  return (
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

const VENUE_FILTERS: Filter<Venue>[] = [
  { persistenceKey: 'library', title: 'My Library', active: false, filter: (y) => y.isFavorite },
  {
    persistenceKey: 'name',
    title: 'Name',
    sortDirection: SortDirection.Descending,
    active: true,
    isNumeric: false,
    sort: (venues) => venues.sort((a, b) => a.name.localeCompare(b.name)),
  },
  {
    persistenceKey: 'shows',
    title: '# of Shows',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (venues) => venues.sort((a, b) => a.showsAtVenue - b.showsAtVenue),
  },
];

interface VenueListProps {
  venues: Venue[];
  filterPersistenceKey: string;
}

const VenueList = ({
  venues,
  filterPersistenceKey,
}: VenueListProps & Omit<FilterableListProps<Venue>, 'data' | 'renderItem'>) => {
  return (
    <FilteringProvider filters={VENUE_FILTERS} filterPersistenceKey={filterPersistenceKey}>
      <FilterableList
        ListHeaderComponent={ <VenueHeader venues={venues} />}
        className="w-full flex-1"
        data={venues}
        renderItem={({ item }) => {
          return <VenueListItem venue={item} />;
        }}
      />
    </FilteringProvider>
  );
};
