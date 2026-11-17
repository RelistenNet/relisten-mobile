import { Link, useRouter } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RelistenText } from '@/relisten/components/relisten_text';
import { usePlaylists } from '@/relisten/playlists/playlist_hooks';
import { PlaylistListRow } from '@/relisten/playlists/ui/playlist_list_row';
import { openNewPlaylist } from '@/relisten/playlists/ui/playlist_navigation';

const PREVIEW_COUNT = 3;

/** "My Playlists" on My Library: the three most recently edited, and a way to start one. */
export function MyPlaylistsSection() {
  const router = useRouter();
  const playlists = usePlaylists();
  const preview = playlists.slice(0, PREVIEW_COUNT);

  return (
    <View className="mb-2">
      <View className="flex-row items-center justify-between pr-2">
        <Link href={{ pathname: '/relisten/tabs/(myLibrary)/playlists' }} asChild>
          <TouchableOpacity
            accessibilityRole="button"
            className="min-h-11 justify-center px-4 py-2"
          >
            <RelistenText className="text-m font-bold">My Playlists&nbsp;›</RelistenText>
          </TouchableOpacity>
        </Link>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="New Playlist"
          className="min-h-11 justify-center px-2"
          onPress={() => openNewPlaylist(router)}
        >
          <RelistenText className="font-semibold text-relisten-blue-400">+ New</RelistenText>
        </TouchableOpacity>
      </View>

      {preview.length === 0 ? (
        <RelistenText className="px-4 pb-2 text-gray-400">
          Playlists keep songs in the order you choose.
        </RelistenText>
      ) : (
        preview.map((playlist, index) => (
          <View key={playlist.playlistId}>
            {index > 0 && <ItemSeparator />}
            <PlaylistListRow playlist={playlist} compact />
          </View>
        ))
      )}
    </View>
  );
}
