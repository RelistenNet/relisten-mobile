import { Artist } from '@/relisten/realm/models/artist';
import { useTodayShows } from '@/relisten/realm/models/shows/today_shows_repo';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { ScrollView, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import Plur from '@/relisten/components/plur';
import { ShowCard, ShowCardLoader } from '@/relisten/components/show_card';
import React from 'react';

export function ArtistShowsOnThisDayTray({ artist }: { artist: Artist }) {
  const todayShows = useTodayShows(artist.uuid);

  return (
    <RefreshContextProvider networkBackedResults={todayShows}>
      <View className="flex px-4 pb-2">
        <RelistenText className="text-m font-bold">
          {todayShows.isNetworkLoading && todayShows.data.length == 0 ? (
            <>Shows on this day</>
          ) : (
            <>
              <Plur word="show" count={todayShows.data.length} /> on this day
            </>
          )}
        </RelistenText>
      </View>
      <ScrollView horizontal className="mb-1 pb-3 pl-3">
        {todayShows.isNetworkLoading && todayShows.data.length == 0 ? (
          <ShowCardLoader
            showArtist={false}
            showVenue={artist.features().per_source_venues || artist.features().per_show_venues}
          />
        ) : (
          todayShows.data.map((show) => (
            <ShowCard show={show} key={show.uuid} root="artists" showArtist={false} />
          ))
        )}
      </ScrollView>
    </RefreshContextProvider>
  );
}
