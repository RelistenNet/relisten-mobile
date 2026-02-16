import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { ShowCard, ShowCardLoader } from '@/relisten/components/show_card';
import { Artist } from '@/relisten/realm/models/artist';
import { useShowsByMomentum } from '@/relisten/realm/models/shows/shows_by_momentum_repo';
import { useCallback, useMemo, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import Flex from '@/relisten/components/flex';
import { useFocusEffect } from 'expo-router';

export function ArtistShowsByMomentumTray({ artists }: { artists: Artist[] }) {
  const artistUuids = useMemo(() => artists.map((artist) => artist.uuid), [artists]);
  const momentumShows = useShowsByMomentum(artistUuids);
  const hasFocusedOnce = useRef(false);
  const primaryArtist = artists[0];

  useFocusEffect(
    useCallback(() => {
      if (hasFocusedOnce.current) {
        momentumShows.refresh(false);
      } else {
        hasFocusedOnce.current = true;
      }
    }, [momentumShows.refresh])
  );

  const topMomentumShows = useMemo(() => {
    return [...momentumShows.data].slice(0, 25);
  }, [momentumShows.data]);

  return (
    <RefreshContextProvider networkBackedResults={momentumShows}>
      <View className="flex px-4 pb-2">
        <RelistenText className="text-m font-bold">Popular and trending shows</RelistenText>
      </View>
      <ScrollView horizontal className="mb-1 pb-3 pl-3">
        <Flex className="">
          {momentumShows.isNetworkLoading && topMomentumShows.length == 0 ? (
            <ShowCardLoader
              showArtist={artists.length > 1}
              showVenue={
                !primaryArtist ||
                primaryArtist.features().per_source_venues ||
                primaryArtist.features().per_show_venues
              }
            />
          ) : (
            topMomentumShows.map((show) => (
              <ShowCard
                show={show}
                key={show.uuid}
                root="artists"
                showArtist={artists.length > 1}
              />
            ))
          )}
        </Flex>
      </ScrollView>
    </RefreshContextProvider>
  );
}
