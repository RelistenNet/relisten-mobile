import { NonIdealState } from '@/relisten/components/non_ideal_state';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { ShowFilterKey, ShowListContainer } from '@/relisten/components/shows_list';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import Plur from '@/relisten/components/plur';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { SortDirection } from '@/relisten/components/filtering/filters';
import { SongShows, useArtistSongShows } from '@/relisten/realm/models/shows/song_shows_repo';
import { FavoriteTargetButton } from '@/relisten/components/favorite_icon_button';
import Flex from '@/relisten/components/flex';

export default function Page() {
  const navigation = useNavigation();
  const online = useShouldMakeNetworkRequests();
  const { artistUuid, songUuid } = useLocalSearchParams();
  const results = useArtistSongShows(String(artistUuid), String(songUuid));
  const songResult = results.data.song;
  const { song, shows } = songResult;
  const visibleResults = songResult.isAvailable ? { ...results, errors: undefined } : results;
  const isLoading =
    results.isNetworkLoading || (!songResult.isAvailable && !results.errors?.length);

  useEffect(() => {
    navigation.setOptions({
      title: song?.name.trim() || 'Song',
    });
  }, [navigation, song]);

  const data = useMemo(() => {
    return [{ data: [...shows] }];
  }, [shows]);

  if (!online) {
    return (
      <NonIdealState
        icon="cloud-off"
        title="Connection Required"
        description="Connect to the internet to find shows and recordings of this song."
      />
    );
  }

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={visibleResults}>
        <DisappearingHeaderScreen
          ScrollableComponent={ShowListContainer}
          isLoading={isLoading}
          ListHeaderComponent={<SongHeader songResult={songResult} />}
          data={data}
          filterOptions={{
            persistence: {
              key: ['artists', artistUuid, 'song', songUuid].join('/'),
            },
            default: {
              persistenceKey: ShowFilterKey.Date,
              sortDirection: SortDirection.Ascending,
              active: true,
            },
          }}
          nonIdealState={{
            noData: {
              title: 'No Shows',
              description: 'No matched shows are available for this song.',
            },
          }}
        />
      </RefreshContextProvider>
    </View>
  );
}

const SongHeader = ({ songResult }: { songResult: SongShows }) => {
  const { song, shows } = songResult;
  if (!song) return null;
  const totalShows = song.showCount ?? shows.length;

  return (
    <View className="flex w-full flex-col items-center gap-1 py-2">
      <Flex className="w-full items-center justify-center px-4" style={{ gap: 12 }}>
        <RelistenText className="text-center text-4xl font-bold text-white" selectable={false}>
          {song.name.trim() || 'Unknown song'}
        </RelistenText>
        <FavoriteTargetButton {...song.favorite} />
      </Flex>

      <RelistenText className="text-l w-full text-center italic text-gray-400">
        <Plur word="show" count={totalShows} />
      </RelistenText>
    </View>
  );
};
