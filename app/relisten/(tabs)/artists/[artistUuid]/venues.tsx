import { Venue } from '@/relisten/api/models/venue';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenFlatList } from '@/relisten/components/relisten_flat_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import { useArtistVenues } from '@/relisten/realm/models/venue_repo';
import { useGlobalSearchParams } from 'expo-router';
import { FlatList, Text, View } from 'react-native';

export default function Page() {
  const { artistUuid } = useGlobalSearchParams();
  const results = useArtistVenues(String(artistUuid));
  const { data } = results;
  console.log('venues.tsx', JSON.stringify(data.venues));

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <View style={{ flex: 1, width: '100%' }}>
        <Text className="text-white">Venue List</Text>
        <FlatList
          style={{ flex: 1, width: '100%' }}
          data={data.venues as any}
          renderItem={({ item }: { item: Venue; index: number }) => (
            <View>
              <RelistenText>{item.name}</RelistenText>
            </View>
          )}
        />
      </View>
    </RefreshContextProvider>
  );
}
