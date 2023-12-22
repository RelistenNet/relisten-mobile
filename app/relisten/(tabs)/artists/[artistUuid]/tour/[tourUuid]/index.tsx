import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { ShowList } from '@/relisten/components/shows_list';
import { Artist } from '@/relisten/realm/models/artist';
import { useArtistTourShows } from '@/relisten/realm/models/tour_shows_repo';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid, tourUuid } = useLocalSearchParams();
  const results = useArtistTourShows(String(artistUuid), String(tourUuid));

  console.log('Thenlie', results.data.tour.shows);

  useEffect(() => {
    navigation.setOptions({
      title: results.data.tour.tour?.name,
    });
  }, []);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RelistenText>Artist uuid: {artistUuid}</RelistenText>
      <RelistenText>Tour uuid: {tourUuid}</RelistenText>
      <RefreshContextProvider networkBackedResults={results}>
        {/* <DisappearingHeaderScreen
          ScrollableComponent={ShowList}
          ListHeaderComponent={<VenueHeader artist={artist} year={year} />}
          shows={shows}
          artist={artist}
          filterOptions={{
            persistence: { key: ['artists', artistUuid, 'years', yearUuid].join('/') },
          }}
        /> */}
      </RefreshContextProvider>
    </View>
  );
}
