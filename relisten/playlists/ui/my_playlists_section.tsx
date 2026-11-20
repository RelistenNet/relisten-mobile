import { ListRow } from '@/relisten/components/list_row';
import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { SectionHeader } from '@/relisten/components/section_header';
import { RelistenText } from '@/relisten/components/relisten_text';
import {
  useIsFavoritePlaylist,
  usePlaylistSummaries,
  usePlaylists,
} from '@/relisten/playlists/playlist_hooks';
import { PlaylistListRow } from '@/relisten/playlists/ui/playlist_list_row';
import { openNewPlaylist } from '@/relisten/playlists/ui/playlist_navigation';

const PREVIEW_COUNT = 3;

/**
 * Playlists on My Library: favorites first, then the most recently edited, up
 * to three; a + in the header to make one, and See All only when there are
 * more than fit. With none yet, the section offers to make the first.
 */
export function MyPlaylistsSection() {
  const router = useRouter();
  const playlists = usePlaylists();
  const isFavorite = useIsFavoritePlaylist();
  const preview = [
    ...playlists.filter((playlist) => isFavorite(playlist)),
    ...playlists.filter((playlist) => !isFavorite(playlist)),
  ].slice(0, PREVIEW_COUNT);
  const summaryOf = usePlaylistSummaries(preview);

  return (
    <View>
      <SectionHeader className="flex-row items-center py-0 pr-1">
        <RelistenText className="flex-1 py-2 text-m font-bold">Playlists</RelistenText>
        <TouchableOpacity
          accessibilityLabel="New Playlist"
          accessibilityRole="button"
          className="h-10 w-10 items-center justify-center"
          onPress={() => openNewPlaylist(router)}
        >
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>
      </SectionHeader>

      {preview.length === 0 && (
        <ListRow
          title="New Playlist…"
          subtitle="Or add songs from any show’s ••• menu"
          onPress={() => openNewPlaylist(router)}
        />
      )}
      {preview.map((playlist, index) => (
        <View key={playlist.playlistId}>
          {index > 0 && <ItemSeparator />}
          <PlaylistListRow
            playlist={playlist}
            summary={summaryOf(playlist.playlistId)}
            favorite={isFavorite(playlist)}
          />
        </View>
      ))}
      {playlists.length > PREVIEW_COUNT && (
        <>
          <ItemSeparator />
          <Link href={{ pathname: '/relisten/tabs/(myLibrary)/playlists' }} asChild>
            <ListRow title={`See All ${playlists.length} Playlists`} />
          </Link>
        </>
      )}
    </View>
  );
}
