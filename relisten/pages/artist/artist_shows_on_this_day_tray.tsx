import Plur from '@/relisten/components/plur';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { ShowCard, ShowCardLoader } from '@/relisten/components/show_card';
import { Artist } from '@/relisten/realm/models/artist';
import { useTodayShows } from '@/relisten/realm/models/shows/today_shows_repo';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import Flex from '@/relisten/components/flex';

export function ArtistShowsOnThisDayTray({ artists }: { artists: Artist[] }) {
  const todayShows = useTodayShows(...artists.map((artist) => artist.uuid));

  const sortedShows = useMemo(() => {
    const shows = [...todayShows.data];

    shows.sort((a, b) => b.date.getTime() - a.date.getTime());

    return shows;
  }, [todayShows.data]);

  return (
    <RefreshContextProvider networkBackedResults={todayShows}>
      <View className="flex px-4 pb-2">
        <RelistenText className="text-m font-bold">
          {todayShows.isNetworkLoading && sortedShows.length == 0 ? (
            <>Shows on this day</>
          ) : (
            <>
              <Plur word="show" count={sortedShows.length} /> on this day
            </>
          )}
        </RelistenText>
      </View>
      <ScrollView horizontal className="mb-1 pb-3 pl-3">
        <Flex className="gap-x-2">
          {todayShows.isNetworkLoading && sortedShows.length == 0 ? (
            <ShowCardLoader
              showArtist={artists.length > 1}
              showVenue={
                artists[0].features().per_source_venues || artists[0].features().per_show_venues
              }
            />
          ) : (
            sortedShows.map((show) => (
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
