import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
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
  PlaylistViewHeader,
} from '@/relisten/playlists/ui/playlist_reading_view';
import { usePlaylistReaderActions } from '@/relisten/playlists/ui/playlist_reader_actions';
import { sharePlaylistLink } from '@/relisten/playlists/ui/playlist_share_actions';
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
  const headerHeight = useHeaderHeight();
  const sharing = usePlaylistSharingService();
  const reader = usePlaylistReaderActions();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [following, setFollowing] = useState(false);

  const snapshot = load.state === 'ready' ? load.snapshot : undefined;
  const groups = useSnapshotRowGroups(snapshot?.segments ?? NO_SEGMENTS);
  usePlaylistHydration(snapshot?.playlist_id ?? '', groups, online);

  // The listener's own copy of this playlist: by code when it is already
  // known here (offline included), or by ID once the snapshot names it.
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

  const fetchSnapshot = useCallback(() => {
    if (!isPublicCode(publicCode)) {
      setLoad({ state: 'unavailable' });
      return;
    }
    setLoad({ state: 'loading' });
    sharing.publicSnapshot(publicCode).then(
      (result) => setLoad(result ? { state: 'ready', snapshot: result } : { state: 'unavailable' }),
      () => setLoad({ state: 'failed' })
    );
  }, [publicCode, sharing]);

  // The first load, or the first time the device is online after opening.
  // A failed load waits for Try Again.
  const waiting = !stored && online && load.state === 'loading';
  useEffect(() => {
    if (waiting) {
      fetchSnapshot();
    }
  }, [waiting, fetchSnapshot]);

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
      <View
        className="flex-1 items-center bg-relisten-blue-900 px-8"
        style={{ gap: 16, paddingTop: headerHeight + 24 }}
      >
        <Stack.Screen options={{ title: '' }} />
        {load.state === 'loading' && online ? (
          <ActivityIndicator color="white" />
        ) : (
          <>
            <RelistenText className="text-center text-gray-400">
              {load.state === 'unavailable'
                ? 'This playlist isn’t available. Its owner may have made it private.'
                : online
                  ? 'Couldn’t load this playlist.'
                  : 'Connect to the internet to see this playlist.'}
            </RelistenText>
            {load.state !== 'unavailable' && online && (
              <RelistenButton onPress={fetchSnapshot}>Try Again</RelistenButton>
            )}
          </>
        )}
      </View>
    );
  }

  const name = snapshot.metadata.name;
  const follow = async () => {
    setFollowing(true);
    await reader.follow(snapshot);
    // On success the stored follow redirects this screen to it.
    setFollowing(false);
  };

  return (
    <View className="flex-1 bg-relisten-blue-900">
      <Stack.Screen options={{ title: name }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu accessibilityLabel="Playlist actions" icon={nativeMenuIcons.more}>
          <Stack.Toolbar.Menu inline>
            <Stack.Toolbar.MenuAction
              icon={nativeMenuIcons.share}
              onPress={() => sharePlaylistLink(name, publicCode)}
            >
              Share…
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon={nativeMenuIcons.copy}
              onPress={() => void reader.copy(publicCode, name)}
            >
              Make a Copy
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.Menu inline>
            <Stack.Toolbar.MenuAction
              icon={nativeMenuIcons.report}
              onPress={() => reader.report(publicCode, name)}
            >
              Report…
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>

      <PlaylistReadingList
        playlistId={snapshot.playlist_id}
        groups={groups}
        editable={false}
        emptyText="This playlist is empty."
        header={
          <PlaylistViewHeader
            playlistId={snapshot.playlist_id}
            name={name}
            byline={`by @${snapshot.owner.username}`}
            description={snapshot.metadata.description ?? undefined}
            trackCount={publicTrackCount(snapshot)}
            groups={groups}
            follow={{ following: false, busy: following, onPress: () => void follow() }}
          />
        }
      />
    </View>
  );
}
