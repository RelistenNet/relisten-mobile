import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, View } from 'react-native';
import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { OverflowMenuTrigger } from '@/relisten/components/menus/overflow_menu_trigger';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SoundIndicator } from '@/relisten/components/sound_indicator';
import { SourceTrackOfflineIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { useRelistenPlayerPlaybackState } from '@/relisten/player/relisten_player_hooks';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import type { PlaylistRowEntry, PlaylistRowGroup } from '@/relisten/playlists/playlist_hooks';
import {
  GroupMenu,
  singleSourceTrack,
  trackTitle,
  TrackMenu,
} from '@/relisten/playlists/ui/playlist_menus';
import { tw } from '@/relisten/util/tw';

/** "Grateful Dead · 1977-05-08 · Barton Hall". The venue is last, so it is what truncates. */
export function showLine(row: PlaylistRowEntry): string {
  const track = row.sourceTrack;
  if (!track) return '';
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

export function PlaylistTrackRow({
  playlistId,
  groups,
  row,
  showShowLine,
  online,
  playingEntryId,
  onPlay,
}: {
  playlistId: string;
  groups: PlaylistRowGroup[];
  row: PlaylistRowEntry;
  showShowLine: boolean;
  online: boolean;
  playingEntryId: string | undefined;
  onPlay: (entryId: string) => void;
}) {
  const isCurrent = playingEntryId === row.entry.entryId;
  const canPlay = row.status === 'playable';
  const title = row.sourceTrack ? row.sourceTrack.title : 'Track';
  const subtitle = showShowLine ? showLine(row) : '';

  return (
    <View className="min-h-[52px] flex-row items-center">
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={[title, subtitle, isCurrent ? 'Now playing' : '']
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
              'font-semibold text-relisten-blue-300': isCurrent,
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
      <TrackMenu playlistId={playlistId} groups={groups} row={row}>
        <OverflowMenuTrigger
          accessibilityLabel={`Actions for ${trackTitle(row)}`}
          iconAlignment="trailing"
        />
      </TrackMenu>
    </View>
  );
}

/** A group's label: the show when every track shares one, otherwise "Kept together". */
export function groupLabel(group: PlaylistRowGroup): string {
  const track = singleSourceTrack(group);
  if (track) {
    return [track.artist.name, track.show.displayDate, track.show.venue?.name]
      .filter(Boolean)
      .join(' · ');
  }
  return `Kept together · ${group.entries.length} tracks`;
}

/**
 * Tracks kept together, drawn as a card joined by a rail down its left edge.
 * The header is plain text, not accent, so it doesn't read as a link.
 */
export function PlaylistGroupCard({
  playlistId,
  groups,
  group,
  online,
  playingEntryId,
  onPlay,
}: {
  playlistId: string;
  groups: PlaylistRowGroup[];
  group: PlaylistRowGroup;
  online: boolean;
  playingEntryId: string | undefined;
  onPlay: (entryId: string) => void;
}) {
  const isPlaying = group.entries.some((r) => r.entry.entryId === playingEntryId);
  const oneShow = singleSourceTrack(group) !== undefined;

  return (
    <View
      className={tw('my-2 flex-row rounded-xl border bg-relisten-blue-950', {
        'border-relisten-blue-500': isPlaying,
        'border-relisten-blue-800': !isPlaying,
      })}
    >
      <View
        className={tw('my-3 ml-2 w-[3px] rounded-full', {
          'bg-relisten-blue-500': isPlaying,
          'bg-relisten-blue-700': !isPlaying,
        })}
      />
      <View className="min-w-0 flex-1 pl-3 pr-1">
        <GroupMenu playlistId={playlistId} groups={groups} group={group}>
          <View className="min-h-[44px] flex-row items-center" accessibilityRole="button">
            <RelistenText
              className="flex-1 text-sm text-gray-400"
              numberOfLines={1}
              selectable={false}
            >
              {groupLabel(group)}
            </RelistenText>
            <OverflowMenuTrigger
              accessibilityLabel={`Actions for group ${groupLabel(group)}`}
              iconAlignment="trailing"
            />
          </View>
        </GroupMenu>
        {group.entries.map((row, index) => (
          <View key={row.entry.entryId}>
            {index > 0 && <ItemSeparator />}
            <PlaylistTrackRow
              playlistId={playlistId}
              groups={groups}
              row={row}
              showShowLine={!oneShow}
              online={online}
              playingEntryId={playingEntryId}
              onPlay={onPlay}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
