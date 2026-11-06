import { NonIdealState } from '@/relisten/components/non_ideal_state';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { FavoriteTargetButton } from '@/relisten/components/favorite_icon_button';
import { FilterableList } from '@/relisten/components/filtering/filterable_list';
import { FilteringProvider } from '@/relisten/components/filtering/filters';
import Flex from '@/relisten/components/flex';
import Plur from '@/relisten/components/plur';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import RowTitle from '@/relisten/components/row_title';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Artist } from '@/relisten/realm/models/artist';
import { useArtistSongTracks } from '@/relisten/realm/models/song_tracks_repo';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import type { SongItem } from '@/relisten/realm/models/song_view';
import { ShowLink } from '@/relisten/util/push_show';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { ScrollViewProps, View } from 'react-native';

export default function SongTracksPage() {
  const navigation = useNavigation();
  const online = useShouldMakeNetworkRequests();
  const { artistUuid, songUuid } = useLocalSearchParams();
  const results = useArtistSongTracks(String(artistUuid), String(songUuid));
  const { artist, songTracks } = results.data;
  const visibleResults = songTracks.isAvailable ? { ...results, errors: undefined } : results;
  const isLoading =
    results.isNetworkLoading || (!songTracks.isAvailable && !results.errors?.length);

  useEffect(() => {
    navigation.setOptions({
      title: songTracks.song?.name.trim() || 'Recordings',
    });
  }, [navigation, songTracks.song]);

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
    <RefreshContextProvider networkBackedResults={visibleResults}>
      <DisappearingHeaderScreen
        ScrollableComponent={TrackList}
        artist={artist}
        isLoading={isLoading}
        song={songTracks.song}
        tracks={songTracks.tracks}
      />
    </RefreshContextProvider>
  );
}

type TrackListProps = {
  artist: Artist | null;
  isLoading: boolean;
  song: SongItem | null;
  tracks: SourceTrack[];
} & Pick<ScrollViewProps, 'onScroll' | 'scrollEventThrottle'>;

function TrackList({ artist, isLoading, song, tracks, ...scrollProps }: TrackListProps) {
  return (
    <FilteringProvider filters={[]}>
      <FilterableList
        {...scrollProps}
        filtering={false}
        isLoading={isLoading}
        ListHeaderComponent={
          <View className="w-full items-center gap-1 py-2">
            <Flex className="w-full items-center justify-center px-4" style={{ gap: 12 }}>
              <RelistenText className="text-center text-4xl font-bold text-white">
                {song?.name.trim() || 'Unknown song'}
              </RelistenText>
              {song && <FavoriteTargetButton {...song.favorite} />}
            </Flex>
            <RelistenText className="text-l text-center italic text-gray-400">
              <Plur word="recording" count={tracks.length} />
            </RelistenText>
          </View>
        }
        data={[{ data: tracks }]}
        renderItem={({ item }) => <TrackRow artist={artist} track={item} />}
        nonIdealState={{
          noData: {
            title: 'No Recordings',
            description: 'No playable recordings are matched to this song.',
          },
        }}
      />
    </FilteringProvider>
  );
}

function TrackRow({ artist, track }: { artist: Artist | null; track: SourceTrack }) {
  const show = track.show;
  const venue = show?.venue;
  const row = (
    <SectionedListItem>
      <Flex className="items-center justify-between" full>
        <Flex className="min-w-0 flex-1 pr-3" column>
          <RowTitle>{track.title}</RowTitle>
          <SubtitleRow>
            <SubtitleText>
              {show?.displayDate ?? 'Show unavailable'}
              {venue ? ` · ${venue.name}, ${venue.location}` : ''}
            </SubtitleText>
          </SubtitleRow>
        </Flex>
        <SubtitleText>{track.humanizedDuration}</SubtitleText>
      </Flex>
    </SectionedListItem>
  );

  if (!artist) return row;

  return (
    <ShowLink
      show={{
        artist,
        showUuid: track.showUuid,
        sourceUuid: track.sourceUuid,
        playTrackUuid: track.uuid,
      }}
      asChild
    >
      {row}
    </ShowLink>
  );
}
