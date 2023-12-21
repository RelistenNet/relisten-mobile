import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { ShowList } from '@/relisten/components/shows_list';
import { Artist } from '@/relisten/realm/models/artist';
import { useArtistVenueShows } from '@/relisten/realm/models/venue_shows_repo';
import { Year } from '@/relisten/realm/models/year';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid, venueUuid } = useLocalSearchParams();
  const results = useArtistVenueShows(String(artistUuid), String(venueUuid));

  useEffect(() => {
    navigation.setOptions({
      title: results.data.venues.venue?.name,
    });
  }, []);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RelistenText>Artist uuid: {artistUuid}</RelistenText>
      <RelistenText>Venue uuid: {venueUuid}</RelistenText>
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
