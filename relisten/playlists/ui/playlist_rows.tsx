import { TrackDuration } from '@/relisten/components/track_duration';
import { Ionicons } from '@expo/vector-icons';
import { memo, type ReactNode } from 'react';
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
import { showLine, trackTitle } from '@/relisten/playlists/playlist_format';
import type { LinkPosition } from '@/relisten/playlists/playlist_drag_slots';
import { TrackMenu } from '@/relisten/playlists/ui/playlist_menus';
import { isQueueable } from '@/relisten/playlists/playlist_playback';
import { tw } from '@/relisten/util/tw';
import { closesCard, LinkCardRow } from '@/relisten/playlists/ui/link_card';
import { GuideMarkdown } from '@/relisten/playlists/guide/guide_markdown_view';

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
        <RelistenText className="ml-1 text-sm text-[#e5c07b]">No longer available</RelistenText>
      </View>
    );
  }
  if (row.status === 'loading') {
    return (
      <RelistenText className="text-sm text-gray-400">
        {online ? 'Loading track details…' : 'Needs internet to load'}
      </RelistenText>
    );
  }
  return null;
}

/**
 * One row of the playlist view: a group's description (its intro, above its
 * entries), or an entry (a track or a text block) and where it sits in its
 * group's card. A group with only a description is just its intro row.
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
      /** A bare row directly above a card, which needs no hairline: the card's edge separates them. */
      beforeCard?: boolean;
    };

export function playlistViewRows(groups: PlaylistRowGroup[]): PlaylistViewRow[] {
  const rows: PlaylistViewRow[] = [];
  for (const group of groups) {
    // An intro belongs to its tracks, so it opens their card. A card needs
    // something to hold together: the intro and at least one entry, or
    // several entries. Everything else is drawn bare.
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

  rows.forEach((row, index) => {
    if (row.kind === 'entry' && !row.link && rows[index + 1]?.link) {
      row.beforeCard = true;
    }
  });
  return rows;
}

/** Separates rows that stand apart: lone tracks, and the rows inside a card. */
const HAIRLINE = 'border-b border-white/10';

/**
 * Text standing on its own between tracks gets a little more room than a
 * track row. The renderer drops the last block's bottom margin, so this
 * padding sets the space below, whether the text ends in a paragraph or a list.
 */
const PROSE_PADDING = 'py-4';

/** Content inset from the screen's edges, on bare rows and inside cards alike. */
const ROW_PADDING_LEFT = 16;
const ROW_PADDING_RIGHT = 14;

/**
 * Where a reading-view row draws: a slice of its group's card when `link` is
 * set (a linked run, or tracks under an intro), otherwise bare.
 */
function PlaylistRowFrame({
  link,
  linkPlaying,
  children,
}: {
  link: LinkPosition | undefined;
  linkPlaying: boolean;
  children: ReactNode;
}) {
  return (
    <LinkCardRow
      link={link}
      playing={linkPlaying}
      paddingLeft={ROW_PADDING_LEFT}
      paddingRight={ROW_PADDING_RIGHT}
    >
      {children}
    </LinkCardRow>
  );
}

/** Handles a tapped timestamp link: which entry (defaulting to the note's own track) and when. */
export type TimestampHandler = (entryId: string, seconds: number) => void;

/**
 * A group's intro. With tracks under it, it opens their card; a group that is
 * only a description is bare prose. Edited from the menu or in edit mode.
 */
export const PlaylistIntroRow = memo(function PlaylistIntroRow({
  viewRow,
  linkPlaying,
  onTimestamp,
}: {
  viewRow: Extract<PlaylistViewRow, { kind: 'intro' }>;
  linkPlaying: boolean;
  onTimestamp: TimestampHandler;
}) {
  const inCard = viewRow.link !== undefined;
  return (
    <PlaylistRowFrame link={viewRow.link} linkPlaying={linkPlaying}>
      {/* In a card, the intro leads straight into its first track, without a hairline. */}
      <View className={tw('pr-2', inCard ? 'pb-1 pt-3' : PROSE_PADDING)}>
        <GuideMarkdown
          markdown={viewRow.markdown}
          variant={inCard ? 'card' : 'prose'}
          // Sanitizing turns entry-less timestamps outside a track's note into text.
          onTimestamp={(entryId, seconds) => entryId && onTimestamp(entryId, seconds)}
        />
      </View>
    </PlaylistRowFrame>
  );
});

/**
 * A text block between tracks: bare prose, or part of the card when it sits
 * in a linked run. It has the same menu as a track, minus playback, so a
 * playlist the listener can't edit shows no menu.
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
  const inCard = link !== undefined;
  return (
    <PlaylistRowFrame link={link} linkPlaying={linkPlaying}>
      <View
        className={tw('min-h-[52px] flex-row items-start', {
          [HAIRLINE]: inCard && !closesCard(link),
        })}
      >
        <View className={tw('min-w-0 flex-1', inCard ? 'py-3' : PROSE_PADDING)}>
          <GuideMarkdown
            markdown={row.descriptionMarkdown ?? ''}
            variant={inCard ? 'card' : 'prose'}
            onTimestamp={(entryId, seconds) => entryId && onTimestamp(entryId, seconds)}
          />
        </View>
        {editable && (
          <TrackMenu playlistId={playlistId} layout={layout} row={row}>
            <OverflowMenuTrigger accessibilityLabel="Actions for note" iconAlignment="trailing" />
          </TrackMenu>
        )}
      </View>
    </PlaylistRowFrame>
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
  /** True when a track in this row's card is playing; the card brightens. */
  linkPlaying: boolean;
  onPlay: (entryId: string) => void;
  onTimestamp: TimestampHandler;
}) {
  const { row, link } = viewRow;
  // Offline, a track that isn't downloaded is dimmed and can't be tapped.
  const canPlay = isQueueable(row, online);
  const title = row.sourceTrack ? row.sourceTrack.title : 'Track';
  const subtitle = showLine(row);
  // A track and its note read as one unit, so the hairline goes below the note.
  const hairlineBelow = !closesCard(link) && !viewRow.beforeCard;

  return (
    <PlaylistRowFrame link={link} linkPlaying={linkPlaying}>
      <View
        className={tw('min-h-[52px] flex-row items-center', {
          [HAIRLINE]: hairlineBelow && !row.descriptionMarkdown,
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
            >
              {title}
            </RelistenText>
            {subtitle !== '' && canPlay && (
              <RelistenText className="text-sm text-gray-400" numberOfLines={1}>
                {subtitle}
              </RelistenText>
            )}
            <StatusLine row={row} online={online} />
          </View>
          {canPlay && (
            <View className="ml-2 flex-row items-center">
              <SourceTrackOfflineIndicator
                offlineInfo={row.sourceTrack!.offlineInfo}
                observeProgress
              />
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
        <View className={tw('flex-row pb-3 pl-1 pr-2', { [HAIRLINE]: hairlineBelow })}>
          <RelistenText
            className="mr-1.5 text-sm text-gray-400"
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            ↳
          </RelistenText>
          <View className="min-w-0 flex-1">
            <GuideMarkdown
              markdown={row.descriptionMarkdown}
              variant="note"
              onTimestamp={(entryId, seconds) => onTimestamp(entryId ?? row.entry.entryId, seconds)}
            />
          </View>
        </View>
      )}
    </PlaylistRowFrame>
  );
});
