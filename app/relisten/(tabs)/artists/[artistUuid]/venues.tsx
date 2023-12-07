import { useArtistVenues } from '@/relisten/realm/models/venue_repo';
import { useGlobalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

export default function Page() {
  const { artistUuid } = useGlobalSearchParams();
  const results = useArtistVenues(String(artistUuid));
  const { data } = results;
  console.log('venues.tsx', JSON.stringify(data));

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <Text className="text-white">Venue List</Text>
    </View>
  );
}
