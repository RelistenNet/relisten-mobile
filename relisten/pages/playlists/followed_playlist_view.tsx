import { Stack, useFocusEffect } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import type { Playlist } from '@/relisten/realm/models/playlists/playlist';
import type { PlaylistRowGroup } from '@/relisten/playlists/playlist_hooks';
import { usePlaylistHydration } from '@/relisten/playlists/playlist_hydration';
import {
  PlaylistReadingList,
  PlaylistViewHeader,
} from '@/relisten/playlists/ui/playlist_reading_view';
import { usePlaylistReaderActions } from '@/relisten/playlists/ui/playlist_reader_actions';
import { sharePlaylistLink } from '@/relisten/playlists/ui/playlist_share_actions';
import { usePlaylistSyncService } from '@/relisten/realm/root_services';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

/**
 * A playlist the listener follows: read-only, kept up to date from its public
 * snapshot. When its owner makes it private, or it is taken down, its
 * contents are hidden and it stays listed, marked unavailable, until the
 * listener unfollows it.
 */
export function FollowedPlaylistView({
  playlist,
  groups,
}: {
  playlist: Playlist;
  groups: PlaylistRowGroup[];
}) {
  const online = useShouldMakeNetworkRequests();
  const headerHeight = useHeaderHeight();
  const syncService = usePlaylistSyncService();
  const reader = usePlaylistReaderActions();
  const [downloadedOnly, setDownloadedOnly] = useState(false);
  const { playlistId, publicCode, unavailable } = playlist;
  const name = playlist.name || (unavailable ? 'Unavailable playlist' : '');
  const loaded = playlist.appliedRevision != null;

  usePlaylistHydration(playlistId, unavailable ? [] : groups, online);
  // Opening it fetches the owner's latest edits, if its head says there are any.
  useFocusEffect(
    useCallback(() => {
      syncService.checkForChanges(playlistId);
    }, [playlistId, syncService])
  );

  return (
    <View className="flex-1 bg-relisten-blue-900">
      {/* The unavailable notice shows the name itself, below the transparent header. */}
      <Stack.Screen options={{ title: unavailable ? '' : name }} />
      {publicCode && !unavailable ? (
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
              <Stack.Toolbar.MenuAction
                icon={nativeMenuIcons.download}
                isOn={downloadedOnly}
                onPress={() => setDownloadedOnly(!downloadedOnly)}
              >
                Show Downloaded Only
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
      ) : null}

      {unavailable ? (
        <View
          className="flex-1 items-center px-8"
          style={{ gap: 16, paddingTop: headerHeight + 24 }}
        >
          <RelistenText className="text-center text-2xl font-bold">{name}</RelistenText>
          <RelistenText className="text-center text-gray-400">
            This playlist isn’t available anymore. Its owner may have made it private.
          </RelistenText>
          <RelistenButton onPress={() => reader.unfollow(playlistId, name)}>
            Unfollow
          </RelistenButton>
        </View>
      ) : (
        <PlaylistReadingList
          playlistId={playlistId}
          groups={groups}
          editable={false}
          downloadedOnly={downloadedOnly}
          emptyText={
            loaded
              ? 'This playlist is empty.'
              : online
                ? 'Loading…'
                : 'Connect to the internet to load this playlist.'
          }
          header={
            <PlaylistViewHeader
              playlistId={playlistId}
              name={name}
              byline={playlist.ownerUsername ? `by @${playlist.ownerUsername}` : undefined}
              description={playlist.description}
              trackCount={playlist.entryCount}
              groups={groups}
              follow={{
                following: true,
                onPress: () => reader.unfollow(playlistId, name, publicCode),
              }}
            />
          }
        />
      )}
    </View>
  );
}
