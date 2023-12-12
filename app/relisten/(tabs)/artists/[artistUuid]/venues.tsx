import React from 'react';
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

export default function Page() {
  const { artistUuid } = useLocalSearchParams();
  const results = useArtistVenues(String(artistUuid));
  const { data } = results;

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        headerHeight={50}
        ScrollableComponent={VenueList}
        venues={Array.from(data.venues)}
        filterPersistenceKey={['artists', artistUuid, 'venues'].join('/')}
      />
    </RefreshContextProvider>
  );
}

const VenueListItem: React.FC<{ venue: Venue }> = ({ venue }) => {
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

const VenueHeader: React.FC<{ venues: Venue[] }> = ({ venues }) => {
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
    sortDirection: SortDirection.Ascending,
    active: true,
    isNumeric: true,
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

const VenueList: React.FC<
  { venues: Venue[]; filterPersistenceKey: string } & Omit<
    FilterableListProps<Venue>,
    'data' | 'renderItem'
  >
> = ({ venues, filterPersistenceKey }) => {
  return (
    <FilteringProvider filters={VENUE_FILTERS} filterPersistenceKey={filterPersistenceKey}>
      <FilterableList
        ListHeaderComponent={<VenueHeader venues={venues} />}
        style={{ flex: 1, width: '100%' }}
        data={venues}
        renderItem={({ item }: { item: Venue; index: number }) => <VenueListItem venue={item} />}
      />
    </FilteringProvider>
  );
};
