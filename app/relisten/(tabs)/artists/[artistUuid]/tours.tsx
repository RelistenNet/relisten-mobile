import { useArtistTours } from '@/relisten/realm/models/tour_repo';
import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

export default function Page() {
  const { artistUuid } = useLocalSearchParams();
  const results = useArtistTours(String(artistUuid));
  const { data } = results;
  console.log(JSON.stringify(data));

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <Text className="text-white">Tours</Text>
    </View>
  );
}
