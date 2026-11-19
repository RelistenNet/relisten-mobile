import { TrackDuration } from '@/relisten/components/track_duration';
import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
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
import { isQueueable } from '@/relisten/playlists/playlist_playback';
import { tw } from '@/relisten/util/tw';
import { GuideMarkdown } from '@/relisten/playlists/guide/guide_markdown_view';

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

/**
 * One row of the playlist view: a group's description (its intro, above its
 * entries), or an entry (a track or a text block) and whether it is linked to
 * its neighbors. A group with only a description is just its intro row.
 */
export type PlaylistViewRow =
  | {
      kind: 'intro';
      key: string;
      segmentId: string;
      markdown: string;
      link?: LinkPosition;
    }
  | {
      kind: 'entry';
      key: string;
      segmentId: string;
      row: PlaylistRowEntry;
      link?: LinkPosition;
    };

export function playlistViewRows(groups: PlaylistRowGroup[]): PlaylistViewRow[] {
  const rows: PlaylistViewRow[] = [];
  for (const group of groups) {
    // An intro belongs to its tracks, so it starts their rail. A rail needs
    // something to join: the intro and at least one entry, or several entries.
    const hasIntro = !!group.descriptionMarkdown;
    const count = group.entries.length + (hasIntro ? 1 : 0);
    const linkAt = (index: number): LinkPosition | undefined =>
      count < 2 || group.entries.length === 0
        ? undefined
        : index === 0
          ? 'first'
          : index === count - 1
            ? 'last'
            : 'middle';

    if (group.descriptionMarkdown) {
      rows.push({
        kind: 'intro',
        key: `intro:${group.segment.segmentId}`,
        segmentId: group.segment.segmentId,
        markdown: group.descriptionMarkdown,
        link: linkAt(0),
      });
    }
    group.entries.forEach((row, index) => {
      rows.push({
        kind: 'entry',
        key: row.entry.entryId,
        segmentId: group.segment.segmentId,
        row,
        link: linkAt(index + (hasIntro ? 1 : 0)),
      });
    });
  }
  return rows;
}

/**
 * Vertical padding shared by guide text rows (intros, text blocks and track
 * notes). The renderer drops the last block's bottom margin, so the row's own
 * padding sets the space below, whether the text ends in a paragraph or a list.
 */
const GUIDE_ROW_PADDING = 'py-3';

/** Handles a tapped timestamp link: which entry (defaulting to the note's own track) and when. */
export type TimestampHandler = (entryId: string, seconds: number) => void;

/** A group's intro, above its entries. Edited from the menu or in edit mode. */
export const PlaylistIntroRow = memo(function PlaylistIntroRow({
  viewRow,
  linkPlaying,
  onTimestamp,
}: {
  viewRow: Extract<PlaylistViewRow, { kind: 'intro' }>;
  linkPlaying: boolean;
  onTimestamp: TimestampHandler;
}) {
  return (
    <View className="pl-4 pr-2">
      <LinkRail link={viewRow.link} active={linkPlaying} />
      <View className={tw('border-b border-white/10 pr-2', GUIDE_ROW_PADDING)}>
        <GuideMarkdown
          markdown={viewRow.markdown}
          // Sanitizing turns entry-less timestamps outside a track's note into text.
          onTimestamp={(entryId, seconds) => entryId && onTimestamp(entryId, seconds)}
        />
      </View>
    </View>
  );
});

/**
 * A text block between tracks. It has the same menu as a track, minus
 * playback, so a playlist the listener can't edit shows no menu.
 */
export const PlaylistTextRow = memo(function PlaylistTextRow({
  playlistId,
  layout,
  viewRow,
  editable,
  linkPlaying,
  onTimestamp,
}: {
  playlistId: string;
  layout: PlaylistLayout;
  viewRow: Extract<PlaylistViewRow, { kind: 'entry' }>;
  editable: boolean;
  linkPlaying: boolean;
  onTimestamp: TimestampHandler;
}) {
  const { row, link } = viewRow;
  return (
    <View className="pl-4 pr-2">
      <LinkRail link={link} active={linkPlaying} />
      <View className="min-h-[52px] flex-row items-start border-b border-white/10">
        <View className={tw('min-w-0 flex-1', GUIDE_ROW_PADDING)}>
          <GuideMarkdown
            markdown={row.descriptionMarkdown ?? ''}
            onTimestamp={(entryId, seconds) => entryId && onTimestamp(entryId, seconds)}
          />
        </View>
        {editable && (
          <TrackMenu playlistId={playlistId} layout={layout} row={row}>
            <OverflowMenuTrigger accessibilityLabel="Actions for note" iconAlignment="trailing" />
          </TrackMenu>
        )}
      </View>
    </View>
  );
});

/**
 * Rows are memoized: the list calls `renderItem` for every visible row when
 * the playing track changes, and only the rows it moves between should
 * re-render. Pass booleans like `isCurrent` rather than the playing entry ID,
 * which would differ for all.
 */
export const PlaylistTrackRow = memo(function PlaylistTrackRow({
  playlistId,
  layout,
  viewRow,
  editable,
  online,
  isCurrent,
  linkPlaying,
  onPlay,
  onTimestamp,
}: {
  playlistId: string;
  /** The whole playlist's layout, so moves and links act on every row even when only some show. */
  layout: PlaylistLayout;
  viewRow: Extract<PlaylistViewRow, { kind: 'entry' }>;
  editable: boolean;
  online: boolean;
  /** This entry is the one playing. */
  isCurrent: boolean;
  /** True when a track in this row's linked run is playing; the rail lights up. */
  linkPlaying: boolean;
  onPlay: (entryId: string) => void;
  onTimestamp: TimestampHandler;
}) {
  const { row, link } = viewRow;
  // Offline, a track that isn't downloaded is dimmed and can't be tapped.
  const canPlay = isQueueable(row, online);
  const title = row.sourceTrack ? row.sourceTrack.title : 'Track';
  const subtitle = showLine(row);

  return (
    <View className="pl-4 pr-2">
      <LinkRail link={link} active={linkPlaying} />
      {/* Every row, the last included, ends in a hairline, so a link's rail sits evenly
          between lines. A track with a note ends below the note instead. */}
      <View
        className={tw('min-h-[52px] flex-row items-center', {
          'border-b border-white/10': !row.descriptionMarkdown,
        })}
      >
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
              <View className="ml-2">
                <TrackDuration duration={row.sourceTrack!.humanizedDuration} />
              </View>
            </View>
          )}
        </TouchableOpacity>
        <TrackMenu playlistId={playlistId} layout={layout} row={row} editable={editable}>
          <OverflowMenuTrigger
            accessibilityLabel={`Actions for ${trackTitle(row)}`}
            iconAlignment="trailing"
          />
        </TrackMenu>
      </View>
      {row.descriptionMarkdown && (
        // The note sits under the track, outside its play button, so its links stay tappable.
        <View className="border-b border-white/10 pb-3 pr-2">
          <GuideMarkdown
            markdown={row.descriptionMarkdown}
            secondary
            onTimestamp={(entryId, seconds) => onTimestamp(entryId ?? row.entry.entryId, seconds)}
          />
        </View>
      )}
    </View>
  );
});
