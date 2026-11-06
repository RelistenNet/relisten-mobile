import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenSectionData } from '@/relisten/components/relisten_section_list';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { ShowListContainer } from '@/relisten/components/shows_list';
import { Show } from '@/relisten/realm/models/show';
import { useGlobalVenueShows } from '@/relisten/realm/models/shows/venue_shows_repo';
import { aggregateBy } from '@/relisten/util/group_by';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';

import { VenueHeader, venueDetailName } from './artist_venue_detail_page';

export default function GlobalVenueDetailPage() {
  const navigation = useNavigation();
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const results = useGlobalVenueShows(String(venueId));
  const venue = results.data;

  useEffect(() => {
    navigation.setOptions({ title: venueDetailName(venue) });
  }, [navigation, venue]);

  const data = useMemo<RelistenSectionData<Show>>(() => {
    const byArtist = aggregateBy(venue.shows, (show) => show.artistUuid);
    return Object.values(byArtist)
      .sort((a, b) => a[0].artist.name.localeCompare(b[0].artist.name))
      .map((shows) => ({
        sectionTitle: shows[0].artist.name,
        data: shows,
      }));
  }, [venue.shows]);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={results}>
        <DisappearingHeaderScreen
          ScrollableComponent={ShowListContainer}
          ListHeaderComponent={<VenueHeader venue={venue} />}
          data={data}
          stickySectionHeadersEnabled
          filterOptions={{
            persistence: { key: ['venues', venueId].join('/') },
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
