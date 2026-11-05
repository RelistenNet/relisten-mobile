import { FavoriteObjectButton } from '@/relisten/components/favorite_icon_button';
import Flex from '@/relisten/components/flex';
import Plur from '@/relisten/components/plur';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { ShowListContainer } from '@/relisten/components/shows_list';
import { normalizedVenueLocation } from '@/relisten/components/venue_presenters';
import {
  useArtistVenueShows,
  VenueDetailKind,
  VenueShows,
} from '@/relisten/realm/models/shows/venue_shows_repo';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';

export function venueDetailName(venue: VenueShows) {
  return venue.importedVenue?.name || venue.normalizedVenue?.name || 'Venue';
}

export function venueDetailLocation(venue: VenueShows) {
  return venue.importedVenue?.location || normalizedVenueLocation(venue.normalizedVenue);
}

export function venueDetailShowCount(venue: VenueShows) {
  if (venue.kind === 'artist_venue') return venue.artistVenue?.artistShowCount;
  if (venue.kind === 'imported_venue') return venue.importedVenue?.showsAtVenue;
  return venue.normalizedVenue?.globalShowCount;
}

export function VenueHeader({ venue }: { venue: VenueShows }) {
  const favoriteObject = venue.normalizedVenue ?? venue.importedVenue;
  const location = venueDetailLocation(venue);

  return (
    <View className="w-full flex-col items-center gap-1 px-4 py-2">
      <Flex className="w-full items-center justify-center">
        <RelistenText className="text-center text-4xl font-bold text-white" selectable={false}>
          {venueDetailName(venue)}
        </RelistenText>
        {favoriteObject && <FavoriteObjectButton object={favoriteObject} />}
      </Flex>
      {!!location && (
        <RelistenText className="w-full text-center text-lg text-gray-300">{location}</RelistenText>
      )}
      <RelistenText className="text-l w-full text-center italic text-gray-400">
        <Plur word="show" count={venueDetailShowCount(venue)} />
      </RelistenText>
    </View>
  );
}

function routeVenueKind(value: string | string[] | undefined, venueId: string) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === 'artist_venue' || candidate === 'imported_venue') return candidate;
  return venueId.startsWith('venue_')
    ? ('artist_venue' satisfies VenueDetailKind)
    : ('imported_venue' satisfies VenueDetailKind);
}

export default function ArtistVenueDetailPage() {
  const navigation = useNavigation();
  const { artistUuid, venueUuid, venueKind } = useLocalSearchParams<{
    artistUuid: string;
    venueUuid: string;
    venueKind?: string;
  }>();
  const kind = routeVenueKind(venueKind, String(venueUuid));
  const results = useArtistVenueShows(String(artistUuid), String(venueUuid), kind);
  const venue = results.data.venue;
  const visibleResults = venue.hasAppliedData ? { ...results, errors: undefined } : results;

  useEffect(() => {
    navigation.setOptions({ title: venueDetailName(venue) });
  }, [navigation, venue]);

  const data = useMemo(() => [{ data: venue.shows }], [venue.shows]);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={visibleResults}>
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
