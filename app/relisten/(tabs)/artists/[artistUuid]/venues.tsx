import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenFlatList } from '@/relisten/components/relisten_flat_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleText } from '@/relisten/components/row_subtitle';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Venue } from '@/relisten/realm/models/venue';
import { useArtistVenues } from '@/relisten/realm/models/venue_repo';
import { useGlobalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

const VenueItem = ({ venue }: { venue: Venue }) => {
  return (
    <SectionedListItem>
      <RelistenText>{venue.name}</RelistenText>
      <SubtitleText>{venue.location}</SubtitleText>
    </SectionedListItem>
  );
};

export default function Page() {
  const { artistUuid } = useGlobalSearchParams();
  const results = useArtistVenues(String(artistUuid));
  const { data } = results;
  console.log('venues.tsx', JSON.stringify(data.venues));

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <View style={{ flex: 1, width: '100%' }}>
        <Text className="text-white">Venue List</Text>
        <RelistenFlatList
          style={{ flex: 1, width: '100%' }}
          data={data.venues as any}
          renderItem={({ item }: { item: Venue; index: number }) => <VenueItem venue={item} />}
        />
      </View>
    </RefreshContextProvider>
  );
}
