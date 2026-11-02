import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { ShowFilterKey, ShowListContainer } from '@/relisten/components/shows_list';
import { Link, useLocalSearchParams, useNavigation } from 'expo-router';
import Plur from '@/relisten/components/plur';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { SortDirection } from '@/relisten/components/filtering/filters';
import {
  SongCatalogKind,
  SongShows,
  useArtistSongShows,
} from '@/relisten/realm/models/shows/song_shows_repo';
import { FavoriteObjectButton } from '@/relisten/components/favorite_icon_button';
import Flex from '@/relisten/components/flex';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { useGroupSegment } from '@/relisten/util/routes';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid, songUuid, songKind } = useLocalSearchParams();
  const kind =
    songKind === 'song' || songKind === 'imported_song' ? (songKind as SongCatalogKind) : undefined;
  const results = useArtistSongShows(String(artistUuid), String(songUuid), kind);
  const songResult = results.data.song;
  const { song, shows } = songResult;
  const visibleResults = songResult.hasAppliedData ? { ...results, errors: undefined } : results;
  const isLoading =
    results.isNetworkLoading || (!songResult.hasAppliedData && !results.errors?.length);

  useEffect(() => {
    navigation.setOptions({
      title: song?.name.trim() || 'Song',
    });
  }, [navigation, song]);

  const data = useMemo(() => {
    return [{ data: [...shows] }];
  }, [shows]);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={visibleResults}>
        <DisappearingHeaderScreen
          ScrollableComponent={ShowListContainer}
          isLoading={isLoading}
          ListHeaderComponent={
            <SongHeader
              artistUuid={String(artistUuid)}
              songUuid={String(songUuid)}
              songResult={songResult}
            />
          }
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

const SongHeader = ({
  artistUuid,
  songUuid,
  songResult,
}: {
  artistUuid: string;
  songUuid: string;
  songResult: SongShows;
}) => {
  const groupSegment = useGroupSegment();
  const { song, kind, shows } = songResult;
  const totalShows =
    kind === 'song'
      ? (song?.matchedShowCount ?? shows.length)
      : (song?.showsPlayedAt ?? shows.length);
  const matchedTrackCount = kind === 'song' ? (song?.matchedTrackCount ?? 0) : 0;

  return (
    <View className="flex w-full flex-col items-center gap-1 py-2">
      <Flex className="w-full items-center justify-center px-4" style={{ gap: 12 }}>
        <RelistenText className="text-center text-4xl font-bold text-white" selectable={false}>
          {song?.name.trim() || 'Unknown song'}
        </RelistenText>
        {song && <FavoriteObjectButton object={song} />}
      </Flex>

      <RelistenText className="text-l w-full text-center italic text-gray-400">
        <Plur word="show" count={totalShows} />
      </RelistenText>

      {kind === 'song' && (
        <Link
          href={{
            pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/song/[songUuid]/tracks` as const,
            params: { artistUuid, songUuid },
          }}
          asChild
        >
          <RelistenButton className="mt-2 min-w-[50%]" intent="outline" size="thin">
            <Plur word="Recording" count={matchedTrackCount} />
          </RelistenButton>
        </Link>
      )}
    </View>
  );
};
