import { usePublicPlaylistAudience } from '@/relisten/playlists/ui/playlist_audience';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import type { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { playlistDisplayName } from '@/relisten/playlists/playlist_format';
import type { PlaylistRowGroup } from '@/relisten/playlists/playlist_hooks';
import {
  notLoadedText,
  PlaylistReadingList,
  usePlaylistSearch,
  PlaylistScreenNotice,
  PlaylistViewHeader,
} from '@/relisten/playlists/ui/playlist_reading_view';
import { usePlaylistReaderActions } from '@/relisten/playlists/ui/playlist_reader_actions';
import { ReaderPlaylistMenu } from '@/relisten/playlists/ui/reader_playlist_menu';
import { sharePlaylistLink } from '@/relisten/playlists/ui/playlist_share_actions';
import { UNAVAILABLE_PLAYLIST } from '@/relisten/playlists/ui/sharing_messages';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

/**
 * A playlist the listener follows: read-only, kept up to date from its public
 * snapshot. When its owner makes it private, or it is taken down, its
 * contents are hidden and it stays listed, marked unavailable, until the
 * listener unfollows it. The detail page fetches its tracks and changes.
 */
export function FollowedPlaylistView({
  playlist,
  groups,
}: {
  playlist: Playlist;
  groups: PlaylistRowGroup[];
}) {
  const online = useShouldMakeNetworkRequests();
  const reader = usePlaylistReaderActions();
  const [downloadedOnly, setDownloadedOnly] = useState(false);
  const search = usePlaylistSearch();
  const { playlistId, publicCode, unavailable } = playlist;
  const audience = usePublicPlaylistAudience(unavailable ? null : publicCode);
  const name = playlistDisplayName(playlist);
  // Sharing and copying go through the playlist's public link. A followed
  // playlist that is still available has one; without it, say why not.
  const withPublicCode = (run: (code: string) => void) => () =>
    publicCode ? run(publicCode) : Alert.alert(...UNAVAILABLE_PLAYLIST);

  if (unavailable) {
    return (
      <PlaylistScreenNotice>
        {/* The notice shows the name itself, below the transparent header. */}
        <Stack.Screen options={{ title: '' }} />
        <RelistenText className="text-center text-2xl font-bold">{name}</RelistenText>
        <RelistenText className="text-center text-gray-400">
          {UNAVAILABLE_PLAYLIST.join(' ')}
        </RelistenText>
        <RelistenButton disabled={reader.busy} onPress={() => reader.unfollow(playlistId, name)}>
          Unfollow
        </RelistenButton>
      </PlaylistScreenNotice>
    );
  }

  return (
    <View className="flex-1 bg-relisten-blue-900">
      <Stack.Screen options={{ title: name }} />
      {publicCode ? (
        <ReaderPlaylistMenu
          name={name}
          publicCode={publicCode}
          reader={reader}
          downloadedOnly={downloadedOnly}
          onToggleDownloadedOnly={() => setDownloadedOnly(!downloadedOnly)}
          onSearch={search.open}
        />
      ) : null}
      <PlaylistReadingList
        playlistId={playlistId}
        groups={groups}
        editable={false}
        downloadedOnly={downloadedOnly}
        search={search}
        emptyText={
          playlist.appliedRevision != null ? 'This playlist is empty.' : notLoadedText(online)
        }
        header={
          <PlaylistViewHeader
            playlistId={playlistId}
            name={name}
            byline={playlist.ownerUsername ? `by @${playlist.ownerUsername}` : undefined}
            description={playlist.description}
            audience={audience}
            trackCount={playlist.entryCount}
            groups={groups}
            actions={{
              heart: {
                label: 'Follow',
                isOn: true,
                onPress: () => reader.unfollow(playlistId, name, publicCode),
              },
              share: withPublicCode((code) => sharePlaylistLink(name, code)),
              copy: withPublicCode((code) => reader.copy(code, name)),
              busy: reader.busy,
            }}
          />
        }
      />
    </View>
  );
}
