import { ListRow } from '@/relisten/components/list_row';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { RelistenBlue } from '@/relisten/relisten_blue';
import {
  artistLine,
  playlistDisplayName,
  playlistSizeLine,
} from '@/relisten/playlists/playlist_format';
import type { PlaylistSummary } from '@/relisten/playlists/playlist_hooks';
import { useGroupSegment } from '@/relisten/util/routes';

/**
 * A playlist in a list: name, size, and who's in it. No artwork; the app uses
 * none. A followed playlist also says whose it is, or that it's unavailable.
 * The list supplies the summary from usePlaylistSummaries, which reads every
 * row's tracks in one query.
 */
export function PlaylistListRow({
  playlist,
  summary,
  compact = false,
}: {
  playlist: Playlist;
  summary: PlaylistSummary;
  compact?: boolean;
}) {
  const groupSegment = useGroupSegment();
  const artists = artistLine(summary.artistNames);
  const followed = playlist.access === 'follower';
  // Named once its details arrive: a new follow's head, or a new copy's snapshot.
  const name = playlistDisplayName(playlist);
  const size = playlist.unavailable
    ? 'No longer available'
    : playlistSizeLine(playlist.entryCount, summary.durationSeconds);
  const owner = followed && playlist.ownerUsername ? `@${playlist.ownerUsername}` : '';
  const details = [owner, artists].filter(Boolean).join(' · ');

  return (
    <Link
      href={{
        pathname: `/relisten/tabs/${groupSegment}/playlists/[playlistId]` as const,
        params: { playlistId: playlist.playlistId },
      }}
      asChild
    >
      <ListRow
        accessibilityLabel={[name, size, owner, artists, summary.allDownloaded ? 'Downloaded' : '']
          .filter(Boolean)
          .join(', ')}
        title={name}
        subtitle={!compact && details !== '' ? `${size}\n${details}` : size}
        accessory={
          summary.allDownloaded ? (
            <Ionicons name="checkmark-circle-outline" size={18} color={RelistenBlue[400]} />
          ) : undefined
        }
      />
    </Link>
  );
}
