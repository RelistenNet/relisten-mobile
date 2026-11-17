import { ListRow } from '@/relisten/components/list_row';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
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
      <ListRow
        accessibilityLabel={[
          playlist.name,
          size,
          artists,
          summary.allDownloaded ? 'Downloaded' : '',
        ]
          .filter(Boolean)
          .join(', ')}
        title={playlist.name}
        subtitle={!compact && artists !== '' ? `${size}\n${artists}` : size}
        accessory={
          summary.allDownloaded ? (
            <Ionicons name="checkmark-circle-outline" size={18} color={RelistenBlue[400]} />
          ) : undefined
        }
      />
    </Link>
  );
}
