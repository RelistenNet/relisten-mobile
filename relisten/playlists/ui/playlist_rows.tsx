import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, View } from 'react-native';
import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { OverflowMenuTrigger } from '@/relisten/components/menus/overflow_menu_trigger';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SoundIndicator } from '@/relisten/components/sound_indicator';
import { SourceTrackOfflineIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { useRelistenPlayerPlaybackState } from '@/relisten/player/relisten_player_hooks';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import type {
  PlaylistLayout,
  PlaylistRowEntry,
  PlaylistRowGroup,
} from '@/relisten/playlists/playlist_hooks';
import { trackTitle } from '@/relisten/playlists/playlist_format';
import type { LinkPosition } from '@/relisten/playlists/playlist_drag_slots';
import { TrackMenu } from '@/relisten/playlists/ui/playlist_menus';
import { LinkRail } from '@/relisten/playlists/ui/link_rail';
import { tw } from '@/relisten/util/tw';

/** "Grateful Dead · 1977-05-08 · Barton Hall". The venue is last, so it is what truncates. */
export function showLine(row: PlaylistRowEntry): string {
  const track = row.sourceTrack;
  if (!track) {
    return '';
  }
  return [track.artist.name, track.show.displayDate, track.show.venue?.name]
    .filter(Boolean)
    .join(' · ');
}

/** The queue occurrence playing from this playlist, if any. */
export function usePlayingEntryId(playlistId: string) {
  const current = useRelistenPlayerCurrentTrack();
  return current?.playlistContext?.playlistId === playlistId
    ? current.playlistContext.entryId
    : undefined;
}

/** Only the current row subscribes to play/pause, so pausing doesn't re-render the list. */
function NowPlayingIndicator() {
  const playbackState = useRelistenPlayerPlaybackState();
  return <SoundIndicator size={16} playing={playbackState === RelistenPlaybackState.Playing} />;
}

function StatusLine({ row, online }: { row: PlaylistRowEntry; online: boolean }) {
  if (row.status === 'unavailable') {
    return (
      <View className="flex-row items-center">
        <Ionicons name="ban-outline" size={13} color="#e5c07b" />
        <RelistenText className="ml-1 text-sm text-[#e5c07b]" selectable={false}>
          No longer available
        </RelistenText>
      </View>
    );
  }
  if (row.status === 'loading') {
    return (
      <RelistenText className="text-sm text-gray-400" selectable={false}>
        {online ? 'Loading track details…' : 'Needs internet to load'}
      </RelistenText>
    );
  }
  return null;
}

/** One row of the playlist view: a track, and whether it is linked to its neighbors. */
export interface PlaylistViewRow {
  row: PlaylistRowEntry;
  group: PlaylistRowGroup;
  link?: LinkPosition;
}

export function playlistViewRows(groups: PlaylistRowGroup[]): PlaylistViewRow[] {
  const rows: PlaylistViewRow[] = [];
  for (const group of groups) {
    const count = group.entries.length;
    group.entries.forEach((row, index) => {
      rows.push({
        row,
        group,
        link:
          count < 2 ? undefined : index === 0 ? 'first' : index === count - 1 ? 'last' : 'middle',
      });
    });
  }
  return rows;
}

export function PlaylistTrackRow({
  playlistId,
  layout,
  viewRow,
  online,
  playingEntryId,
  linkPlaying,
  onPlay,
}: {
  playlistId: string;
  layout: PlaylistLayout;
  viewRow: PlaylistViewRow;
  online: boolean;
  playingEntryId: string | undefined;
  /** True when a track in this row's linked run is playing; the rail lights up. */
  linkPlaying: boolean;
  onPlay: (entryId: string) => void;
}) {
  const { row, link } = viewRow;
  const isCurrent = playingEntryId === row.entry.entryId;
  const canPlay = row.status === 'playable';
  const title = row.sourceTrack ? row.sourceTrack.title : 'Track';
  const subtitle = showLine(row);

  return (
    <View className="pl-4 pr-2">
      <LinkRail link={link} active={linkPlaying} />
      {/* Every row, the last included, ends in a hairline, so a link's rail sits evenly between lines. */}
      <View className="min-h-[52px] flex-row items-center border-b border-white/10">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={[
            title,
            subtitle,
            link ? 'Linked' : '',
            isCurrent ? 'Now playing' : '',
          ]
            .filter(Boolean)
            .join(', ')}
          accessibilityState={{ disabled: !canPlay }}
          className="min-w-0 flex-1 flex-row items-center py-2"
          disabled={!canPlay}
          onPress={() => onPlay(row.entry.entryId)}
        >
          {isCurrent && (
            <View className="mr-2">
              <NowPlayingIndicator />
            </View>
          )}
          <View className="min-w-0 flex-1">
            <RelistenText
              className={tw('text-lg', {
                'text-gray-300': !canPlay,
              })}
              numberOfLines={2}
              selectable={false}
            >
              {title}
            </RelistenText>
            {subtitle !== '' && canPlay && (
              <RelistenText className="text-sm text-gray-400" numberOfLines={1} selectable={false}>
                {subtitle}
              </RelistenText>
            )}
            <StatusLine row={row} online={online} />
          </View>
          {canPlay && (
            <View className="ml-2 flex-row items-center">
              <SourceTrackOfflineIndicator offlineInfo={row.sourceTrack!.offlineInfo} />
              <RelistenText className="ml-2 text-gray-400" selectable={false}>
                {row.sourceTrack!.humanizedDuration}
              </RelistenText>
            </View>
          )}
        </TouchableOpacity>
        <TrackMenu playlistId={playlistId} layout={layout} row={row}>
          <OverflowMenuTrigger
            accessibilityLabel={`Actions for ${trackTitle(row)}`}
            iconAlignment="trailing"
          />
        </TrackMenu>
      </View>
    </View>
  );
}

/** "Linked · 3 tracks", used where a run of linked tracks is shown as one item. */
export function linkedLabel(group: PlaylistRowGroup): string {
  return `Linked · ${group.entries.length} tracks`;
}
