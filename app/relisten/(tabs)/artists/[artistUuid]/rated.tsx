import { useArtistTopShows } from '@/relisten/realm/models/show_repo';
import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

export default function Page() {
  const { artistUuid } = useLocalSearchParams();
  const results = useArtistTopShows(String(artistUuid));
  const { data } = results;

  console.log(data);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <Text className="text-white">Rated</Text>
    </View>
  );
}
