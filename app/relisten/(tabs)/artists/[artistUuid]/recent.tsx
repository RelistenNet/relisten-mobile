import { useArtistRecentShows } from '@/relisten/realm/models/show_repo';
import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

export default function Page() {
  const { artistUuid } = useLocalSearchParams();
  const { data } = useArtistRecentShows(String(artistUuid));
  const { artist, shows } = data;
  // console.log(JSON.stringify(shows));

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <Text className="text-white">Recent</Text>
    </View>
  );
}
