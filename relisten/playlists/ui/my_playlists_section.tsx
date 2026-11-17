import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RelistenText } from '@/relisten/components/relisten_text';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { usePlaylists } from '@/relisten/playlists/playlist_hooks';
import { PlaylistListRow } from '@/relisten/playlists/ui/playlist_list_row';
import { openNewPlaylist } from '@/relisten/playlists/ui/playlist_navigation';

const PREVIEW_COUNT = 3;

/**
 * "My Playlists" on My Library: the three most recently edited, then a New
 * Playlist row. The header matches the other My Library sections, which have
 * no header actions.
 */
export function MyPlaylistsSection() {
  const router = useRouter();
  const playlists = usePlaylists();
  const preview = playlists.slice(0, PREVIEW_COUNT);

  return (
    <View className="mb-2">
      <Link href={{ pathname: '/relisten/tabs/(myLibrary)/playlists' }} asChild>
        <TouchableOpacity accessibilityRole="button" className="px-4 py-2">
          <RelistenText className="text-m font-bold">My Playlists&nbsp;›</RelistenText>
        </TouchableOpacity>
      </Link>

      {preview.length === 0 && (
        <RelistenText className="px-4 pb-1 text-gray-400">
          Playlists keep songs in the order you choose.
        </RelistenText>
      )}
      {preview.map((playlist) => (
        <View key={playlist.playlistId}>
          <PlaylistListRow playlist={playlist} compact />
          <ItemSeparator />
        </View>
      ))}
      <TouchableOpacity
        accessibilityRole="button"
        className="min-h-[48px] flex-row items-center px-4"
        onPress={() => openNewPlaylist(router)}
      >
        <Ionicons name="add" size={20} color={RelistenBlue[400]} />
        <RelistenText className="ml-2 text-relisten-blue-400" selectable={false}>
          New Playlist…
        </RelistenText>
      </TouchableOpacity>
    </View>
  );
}
