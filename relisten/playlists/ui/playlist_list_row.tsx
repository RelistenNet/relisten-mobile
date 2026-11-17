import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { artistLine, playlistSizeLine } from '@/relisten/playlists/playlist_format';
import { usePlaylistSummary } from '@/relisten/playlists/playlist_hooks';
import { useGroupSegment } from '@/relisten/util/routes';

/** A playlist in a list: name, size, and who's in it. No artwork; the app uses none. */
export function PlaylistListRow({
  playlist,
  compact = false,
}: {
  playlist: Playlist;
  compact?: boolean;
}) {
  const groupSegment = useGroupSegment();
  const summary = usePlaylistSummary(playlist);
  const artists = artistLine(summary.artistNames);
  const size = playlistSizeLine(playlist.entryCount, summary.durationSeconds);

  return (
    <Link
      href={{
        pathname: `/relisten/tabs/${groupSegment}/playlists/[playlistId]` as const,
        params: { playlistId: playlist.playlistId },
      }}
      asChild
    >
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={[
          playlist.name,
          size,
          artists,
          summary.allDownloaded ? 'Downloaded' : '',
        ]
          .filter(Boolean)
          .join(', ')}
        className="min-h-[56px] flex-row items-center px-4 py-3"
      >
        <View className="min-w-0 flex-1">
          <RelistenText className="text-lg font-semibold" numberOfLines={2} selectable={false}>
            {playlist.name}
          </RelistenText>
          <RelistenText className="text-sm text-gray-400" selectable={false}>
            {size}
          </RelistenText>
          {!compact && artists !== '' && (
            <RelistenText className="text-sm text-gray-400" numberOfLines={2} selectable={false}>
              {artists}
            </RelistenText>
          )}
        </View>
        {summary.allDownloaded && (
          <Ionicons name="checkmark-circle-outline" size={18} color={RelistenBlue[400]} />
        )}
        <RelistenText className="ml-2 text-lg text-gray-400" selectable={false}>
          ›
        </RelistenText>
      </TouchableOpacity>
    </Link>
  );
}
