import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { usePlaylists } from '@/relisten/playlists/playlist_hooks';
import { PlaylistListRow } from '@/relisten/playlists/ui/playlist_list_row';
import { openNewPlaylist } from '@/relisten/playlists/ui/playlist_navigation';

const PREVIEW_COUNT = 3;

/**
 * Playlists on My Library: the three most recently edited, a + in the header
 * to make one, and See All only when there are more than fit. With none yet,
 * the section offers to make the first.
 */
export function MyPlaylistsSection() {
  const router = useRouter();
  const playlists = usePlaylists();
  const preview = playlists.slice(0, PREVIEW_COUNT);

  return (
    <View className="mb-6">
      <View className="flex-row items-center py-1 pl-4 pr-2">
        <RelistenText className="flex-1 text-m font-bold">Playlists</RelistenText>
        <TouchableOpacity
          accessibilityLabel="New Playlist"
          accessibilityRole="button"
          className="h-11 w-11 items-center justify-center"
          onPress={() => openNewPlaylist(router)}
        >
          <Ionicons name="add" size={26} color="white" />
        </TouchableOpacity>
      </View>

      <View className="border-y border-white/10">
        {preview.length === 0 && (
          <TouchableOpacity
            accessibilityRole="button"
            className="min-h-[52px] justify-center px-4 py-2"
            onPress={() => openNewPlaylist(router)}
          >
            <View className="flex-row items-center">
              <Ionicons name="add" size={20} color={RelistenBlue[400]} />
              <RelistenText className="ml-2 text-lg" selectable={false}>
                New Playlist…
              </RelistenText>
            </View>
            <RelistenText className="mt-1 text-sm text-gray-400" selectable={false}>
              Or add songs from any show’s ••• menu.
            </RelistenText>
          </TouchableOpacity>
        )}
        {preview.map((playlist, index) => (
          <View key={playlist.playlistId}>
            {index > 0 && <View className="ml-4 h-px bg-white/10" />}
            <PlaylistListRow playlist={playlist} compact />
          </View>
        ))}
        {playlists.length > PREVIEW_COUNT && (
          <>
            <View className="ml-4 h-px bg-white/10" />
            <Link href={{ pathname: '/relisten/tabs/(myLibrary)/playlists' }} asChild>
              <TouchableOpacity
                accessibilityRole="button"
                className="min-h-[48px] flex-row items-center px-4"
              >
                <RelistenText className="flex-1 text-gray-300" selectable={false}>
                  See All {playlists.length} Playlists
                </RelistenText>
                <MaterialIcons color="#9ca3af" name="chevron-right" size={22} />
              </TouchableOpacity>
            </Link>
          </>
        )}
      </View>
    </View>
  );
}
