import { useArtistVenues } from '@/relisten/realm/models/venue_repo';
import { useGlobalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

export default function Page() {
  const { uuid } = useGlobalSearchParams();

  const results = useArtistVenues(String(uuid));
  const { data } = results;

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <Text className="text-white">Songs</Text>
    </View>
  );
}
