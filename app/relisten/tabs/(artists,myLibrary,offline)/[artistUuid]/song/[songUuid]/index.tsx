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

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid, songUuid } = useLocalSearchParams();
  const results = useArtistSongShows(String(artistUuid), String(songUuid));
  const { song } = results.data;
  const { shows } = song || { shows: [] };

  useEffect(() => {
    navigation.setOptions({
      title: song.song?.name,
    });
  }, [song]);

  const data = useMemo(() => {
    return [{ data: [...shows] }];
  }, [shows]);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={results}>
        <DisappearingHeaderScreen
          ScrollableComponent={ShowListContainer}
          ListHeaderComponent={<SongHeader song={song} />}
          data={data}
          filterOptions={{
            persistence: { key: ['artists', artistUuid, 'song', songUuid].join('/') },
            default: {
              persistenceKey: ShowFilterKey.Date,
              sortDirection: SortDirection.Ascending,
              active: true,
            },
          }}
        />
      </RefreshContextProvider>
    </View>
  );
}

const SongHeader = ({ song }: { song: SongShows | null }) => {
  const totalShows = song?.shows?.length;
  return (
    <View className="flex w-full flex-col items-center gap-1 py-2">
      <RelistenText className="w-full text-center text-4xl font-bold text-white" selectable={false}>
        {song?.song?.name}
      </RelistenText>

      <RelistenText className="text-l w-full text-center italic text-gray-400">
        <Plur word="show" count={totalShows} />
      </RelistenText>
    </View>
  );
};
