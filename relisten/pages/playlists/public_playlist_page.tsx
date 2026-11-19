import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { useQuery, useRealm } from '@/relisten/realm/schema';
import { useSnapshotRowGroups } from '@/relisten/playlists/playlist_hooks';
import { usePlaylistHydration } from '@/relisten/playlists/playlist_hydration';
import {
  isPublicCode,
  publicTrackCount,
  type PublicPlaylistSnapshot,
} from '@/relisten/playlists/sharing/sharing_wire';
import { canAccessPlaylist } from '@/relisten/playlists/sync/playlist_sync_state';
import {
  PlaylistReadingList,
  PlaylistScreenNotice,
  PlaylistViewHeader,
} from '@/relisten/playlists/ui/playlist_reading_view';
import { usePlaylistReaderActions } from '@/relisten/playlists/ui/playlist_reader_actions';
import { ReaderPlaylistMenu } from '@/relisten/playlists/ui/reader_playlist_menu';
import { UNAVAILABLE_PLAYLIST } from '@/relisten/playlists/ui/sharing_messages';
import { usePlaylistSharingService } from '@/relisten/realm/root_services';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { useGroupSegment } from '@/relisten/util/routes';

type Load =
  | { state: 'loading' }
  | { state: 'unavailable' }
  | { state: 'failed' }
  | { state: 'ready'; snapshot: PublicPlaylistSnapshot };

const NO_SEGMENTS: PublicPlaylistSnapshot['segments'] = [];

/**
 * A public playlist opened from a `relisten.net/playlists/<code>` link. It
 * reads the public snapshot, signed in or not, and plays like any playlist.
 * Nothing is stored unless the listener follows or copies it. A playlist
 * already in the listener's library, one they made or follow, opens as that.
 */
export default function PublicPlaylistPage() {
  const { publicCode: rawCode } = useLocalSearchParams<{ publicCode: string }>();
  const publicCode = rawCode?.toLowerCase() ?? '';
  const realm = useRealm();
  const groupSegment = useGroupSegment();
  const online = useShouldMakeNetworkRequests();
  const sharing = usePlaylistSharingService();
  const reader = usePlaylistReaderActions();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [downloadedOnly, setDownloadedOnly] = useState(false);

  const snapshot = load.state === 'ready' ? load.snapshot : undefined;
  const groups = useSnapshotRowGroups(snapshot?.segments ?? NO_SEGMENTS);
  usePlaylistHydration(snapshot?.playlist_id ?? '', groups, online);

  // The listener's own copy of this playlist: by code when it is already
  // known here (offline included), or by ID once the snapshot names it. It
  // is also how a successful follow leaves this page: the stored follow
  // redirects to the playlist's own screen.
  const stored = useQuery(
    Playlist,
    (rows) =>
      rows.filtered(
        'publicCode == $0 OR playlistId == $1',
        publicCode,
        snapshot?.playlist_id ?? ''
      ),
    [publicCode, snapshot?.playlist_id]
  ).find((playlist) => canAccessPlaylist(realm, playlist) && !playlist.deletedAt);

  // Fetches while loading: on opening, the first time the device is online
  // after that, and after Try Again. A response for a screen that has moved
  // on is dropped.
  const fetching = !stored && online && load.state === 'loading';
  useEffect(() => {
    if (!fetching) {
      return;
    }
    if (!isPublicCode(publicCode)) {
      setLoad({ state: 'unavailable' });
      return;
    }

    let active = true;
    sharing.publicSnapshot(publicCode).then(
      (result) => {
        if (active) {
          setLoad(result ? { state: 'ready', snapshot: result } : { state: 'unavailable' });
        }
      },
      () => {
        if (active) {
          setLoad({ state: 'failed' });
        }
      }
    );
    return () => {
      active = false;
    };
  }, [fetching, publicCode, sharing]);

  if (stored) {
    return (
      <Redirect
        href={{
          pathname: `/relisten/tabs/${groupSegment}/playlists/[playlistId]`,
          params: { playlistId: stored.playlistId },
        }}
      />
    );
  }

  if (!snapshot) {
    return (
      <PlaylistScreenNotice>
        <Stack.Screen options={{ title: '' }} />
        {load.state === 'loading' && online ? (
          <ActivityIndicator color="white" />
        ) : (
          <>
            <RelistenText className="text-center text-gray-400">
              {load.state === 'unavailable'
                ? UNAVAILABLE_PLAYLIST.join(' ')
                : online
                  ? 'Couldn’t load this playlist.'
                  : 'Connect to the internet to see this playlist.'}
            </RelistenText>
            {load.state === 'failed' && online && (
              <RelistenButton onPress={() => setLoad({ state: 'loading' })}>
                Try Again
              </RelistenButton>
            )}
          </>
        )}
      </PlaylistScreenNotice>
    );
  }

  const name = snapshot.metadata.name;

  return (
    <View className="flex-1 bg-relisten-blue-900">
      <Stack.Screen options={{ title: name }} />
      <ReaderPlaylistMenu
        name={name}
        publicCode={publicCode}
        reader={reader}
        downloadedOnly={downloadedOnly}
        onToggleDownloadedOnly={() => setDownloadedOnly(!downloadedOnly)}
      />

      <PlaylistReadingList
        playlistId={snapshot.playlist_id}
        groups={groups}
        editable={false}
        downloadedOnly={downloadedOnly}
        emptyText="This playlist is empty."
        header={
          <PlaylistViewHeader
            playlistId={snapshot.playlist_id}
            name={name}
            byline={`by @${snapshot.owner.username}`}
            description={snapshot.metadata.description ?? undefined}
            trackCount={publicTrackCount(snapshot)}
            groups={groups}
            follow={{ following: false, busy: reader.busy, onPress: () => reader.follow(snapshot) }}
          />
        }
      />
    </View>
  );
}
