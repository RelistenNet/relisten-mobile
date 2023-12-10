import React from 'react';
import Flex from '@/relisten/components/flex';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenFlatList } from '@/relisten/components/relisten_flat_list';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Venue } from '@/relisten/realm/models/venue';
import { useArtistVenues } from '@/relisten/realm/models/venue_repo';
import { useGlobalSearchParams } from 'expo-router';
import { FilterableListProps } from '@/relisten/components/filtering/filterable_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import Plur from '@/relisten/components/plur';

const VenueListItem: React.FC<{ venue: Venue }> = ({ venue }) => {
  return (
    <SectionedListItem>
      <Flex column>
        <RowTitle>{venue.name}</RowTitle>
        <SubtitleRow>
          <SubtitleText>{venue.location}</SubtitleText>
        </SubtitleRow>
      </Flex>
    </SectionedListItem>
  );
};

const VenueHeader: React.FC<{ venues: Venue[] }> = ({ venues }) => {
  return (
    <>
      <RelistenText className="w-full py-2 text-center text-4xl font-bold text-white">
        Venues
      </RelistenText>
      <RelistenText className="text-l w-full pb-2 text-center italic text-gray-400">
        <Plur word="Location" count={venues.length} />
      </RelistenText>
    </>
  );
};

const VenueList: React.FC<
  { venues: Venue[] } & Omit<FilterableListProps<Venue>, 'data' | 'renderItem'>
> = ({ venues }) => {
  return (
    <RelistenFlatList
      ListHeaderComponent={<VenueHeader venues={venues} />}
      style={{ flex: 1, width: '100%' }}
      data={venues as any}
      renderItem={({ item }: { item: Venue; index: number }) => <VenueListItem venue={item} />}
    />
  );
};

export default function Page() {
  const { artistUuid } = useGlobalSearchParams();
  const results = useArtistVenues(String(artistUuid));
  const { data } = results;
  console.log('venues.tsx', JSON.stringify(data.venues));

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        headerHeight={50}
        ScrollableComponent={VenueList}
        venues={Array.from(data.venues)}
      />
    </RefreshContextProvider>
  );
}
