import Plur from '@/relisten/components/plur';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { ShowListContainer } from '@/relisten/components/shows_list';
import { VenueShows, useArtistVenueShows } from '@/relisten/realm/models/venue_shows_repo';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid, venueUuid } = useLocalSearchParams();
  const results = useArtistVenueShows(String(artistUuid), String(venueUuid));
  const {
    data: { venue, artist },
  } = results;

  useEffect(() => {
    navigation.setOptions({
      title: venue.venue?.name,
    });
  }, []);

  const data = useMemo(() => {
    return [{ data: [...venue.shows] }];
  }, [venue]);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={results}>
        <DisappearingHeaderScreen
          ScrollableComponent={ShowListContainer}
          ListHeaderComponent={<VenueHeader venue={venue} />}
          data={data}
          artist={artist}
          filterOptions={{
            persistence: { key: ['artists', artistUuid, 'venue', venueUuid].join('/') },
          }}
        />
      </RefreshContextProvider>
    </View>
  );
}

const VenueHeader = ({ venue }: { venue: VenueShows | null }) => {
  const totalShows = venue?.shows.length;
  return (
    <View className="flex w-full flex-col items-center gap-1 py-2">
      <RelistenText className="w-full text-center text-4xl font-bold text-white" selectable={false}>
        {venue?.venue?.name}
      </RelistenText>

      <RelistenText className="text-l w-full text-center italic text-gray-400">
        <Plur word="show" count={totalShows} />
      </RelistenText>
    </View>
  );
};
