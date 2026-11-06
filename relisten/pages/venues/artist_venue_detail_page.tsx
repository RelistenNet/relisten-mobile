import { FavoriteTargetButton } from '@/relisten/components/favorite_icon_button';
import Plur from '@/relisten/components/plur';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { ShowListContainer } from '@/relisten/components/shows_list';
import { useArtistVenueShows, VenueShows } from '@/relisten/realm/models/shows/venue_shows_repo';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';

export function venueDetailName(venue: VenueShows) {
  return venue.venue?.name || 'Venue';
}

export function venueDetailLocation(venue: VenueShows) {
  return venue.venue?.location;
}

export function venueDetailShowCount(venue: VenueShows) {
  return venue.venue?.showCount;
}

export function VenueHeader({ venue }: { venue: VenueShows }) {
  const location = venueDetailLocation(venue);

  return (
    <View className="w-full flex-col items-center gap-1 px-4 py-2">
      <RelistenText className="text-center text-4xl font-bold text-white" selectable={false}>
        {venueDetailName(venue)}
      </RelistenText>
      {!!location && (
        <RelistenText className="w-full text-center text-lg text-gray-300">{location}</RelistenText>
      )}
      <RelistenText className="text-l w-full text-center italic text-gray-400">
        <Plur word="show" count={venueDetailShowCount(venue)} />
      </RelistenText>
    </View>
  );
}

export default function ArtistVenueDetailPage() {
  const navigation = useNavigation();
  const { artistUuid, venueUuid } = useLocalSearchParams<{
    artistUuid: string;
    venueUuid: string;
  }>();
  const results = useArtistVenueShows(String(artistUuid), String(venueUuid));
  const venue = results.data.venue;

  useEffect(() => {
    navigation.setOptions({
      title: venueDetailName(venue),
      headerRight: () =>
        venue.venue ? <FavoriteTargetButton {...venue.venue.favorite} className="p-2" /> : null,
    });
  }, [navigation, venue]);

  const data = useMemo(() => [{ data: venue.shows }], [venue.shows]);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={results}>
        <DisappearingHeaderScreen
          ScrollableComponent={ShowListContainer}
          ListHeaderComponent={<VenueHeader venue={venue} />}
          data={data}
          filterOptions={{
            persistence: {
              key: ['artists', artistUuid, 'venue', venueUuid].join('/'),
            },
          }}
          nonIdealState={{
            noData: {
              title: 'No Shows',
              description: 'No shows are available for this venue.',
            },
          }}
        />
      </RefreshContextProvider>
    </View>
  );
}
