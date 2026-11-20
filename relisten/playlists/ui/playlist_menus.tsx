import { useRouter } from 'expo-router';
import { entryTitle, singleSourceTrack } from '@/relisten/playlists/playlist_format';
import { type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { NativeMenuView, type MenuAction } from '@/relisten/components/menus/native_menu_view';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { useRealm } from '@/relisten/realm/schema';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import {
  keepWithAbove,
  moveEntryStep,
  moveEntryToEdge,
  moveSegmentStep,
  moveSegmentToEdge,
  removeEntry,
  removeSegment,
  takeOutOfGroup,
  ungroup,
} from '@/relisten/playlists/playlist_actions';
import type {
  PlaylistLayout,
  PlaylistRowEntry,
  PlaylistRowGroup,
} from '@/relisten/playlists/playlist_hooks';
import { isQueueable, queueTrackFor, queueTracksFor } from '@/relisten/playlists/playlist_playback';
import { showToast } from '@/relisten/components/toast';
import { removedMessage, toastEdit } from '@/relisten/playlists/ui/playlist_toast';
import { useGroupSegment } from '@/relisten/util/routes';
import {
  type GuideTextPlace,
  type GuideTextTarget,
  openGuideTextEditor,
} from '@/relisten/playlists/guide/guide_text_navigation';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

/** Where a row sits, which decides which moves make sense. */
function position(layout: PlaylistLayout, entryId: string) {
  const { groupIndex = -1, index = -1 } = layout.entryPositions.get(entryId) ?? {};
  const group = layout.groups[groupIndex];
  return { groupIndex, group, index, inGroup: (group?.entries.length ?? 0) > 1 };
}

function useGoToShow() {
  const router = useRouter();
  const groupSegment = useGroupSegment();
  return (track: SourceTrack) =>
    router.push({
      pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/show/[showUuid]/source/[sourceUuid]`,
      params: {
        artistUuid: track.artistUuid,
        showUuid: track.showUuid,
        sourceUuid: track.sourceUuid,
      },
    });
}

const action = (
  id: string,
  title: string,
  image: MenuAction['image'],
  destructive = false
): MenuAction => ({
  id,
  title,
  image,
  attributes: destructive ? { destructive: true } : undefined,
});

/** Groups of actions shown with dividers between them; empty groups are left out. */
const menuSections = (sections: MenuAction[][]): MenuAction[] =>
  sections
    .filter((section) => section.length > 0)
    .map((subactions, index) => ({
      id: `section-${index}`,
      title: '',
      displayInline: true,
      subactions,
    }));

/**
 * The menu for one track: playback, moves, grouping, then Remove. Shown in
 * view and edit modes. A playlist the listener can't edit gets playback and
 * Go to Show only.
 */
export function TrackMenu({
  playlistId,
  layout,
  row,
  editable = true,
  style,
  children,
}: {
  playlistId: string;
  layout: PlaylistLayout;
  row: PlaylistRowEntry;
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const realm = useRealm();
  const router = useRouter();
  const player = useRelistenPlayer();
  const online = useShouldMakeNetworkRequests();
  const toast = (changed: boolean, message: string) =>
    toastEdit(realm, playlistId, changed, message);
  const goToShow = useGoToShow();
  const entryId = row.entry.entryId;
  const title = entryTitle(row);
  const { groups } = layout;
  const at = position(layout, entryId);
  // Only a track truly on its own can link up; one with an intro keeps its group
  // (see `isSingle` in playlist_actions).
  const canLinkUp = !at.inGroup && !at.group?.segment.description && at.groupIndex > 0;
  const above = canLinkUp ? groups[at.groupIndex - 1] : undefined;
  // A text-only group above has no entry to link to.
  const aboveLast = above?.entries[above.entries.length - 1];
  const aboveTitle = aboveLast ? entryTitle(aboveLast) : undefined;
  const isFirst = at.inGroup ? at.index === 0 : at.groupIndex === 0;
  const isLast = at.inGroup
    ? at.index === (at.group?.entries.length ?? 0) - 1
    : at.groupIndex === groups.length - 1;
  const groupmate = at.inGroup
    ? at.group!.entries.find((r) => r.entry.entryId !== entryId)
    : undefined;

  const playback: MenuAction[] = [];
  if (isQueueable(row, online)) {
    playback.push(
      action('play-next', 'Play Next', nativeMenuIcons.playNext),
      action('add-to-queue', 'Add to End of Queue', nativeMenuIcons.addToQueue)
    );
  }

  const moves: MenuAction[] = [];
  if (!isFirst) {
    moves.push(action('move-up', 'Move Up', nativeMenuIcons.moveUp));
  }
  if (!isLast) {
    moves.push(action('move-down', 'Move Down', nativeMenuIcons.moveDown));
  }
  // A grouped track can always leave for either edge; a single one only if it isn't there yet.
  if (at.inGroup || at.groupIndex > 0) {
    moves.push(action('move-top', 'Move to Top', nativeMenuIcons.moveToTop));
  }
  if (at.inGroup || at.groupIndex < groups.length - 1) {
    moves.push(action('move-bottom', 'Move to Bottom', nativeMenuIcons.moveToBottom));
  }

  const links: MenuAction[] = [];
  if (at.inGroup) {
    links.push(action('take-out', 'Unlink', nativeMenuIcons.ungroup));
  }
  if (at.inGroup && at.group!.entries.length > 2) {
    links.push(action('unlink-all', 'Unlink All', nativeMenuIcons.ungroup));
  }
  if (aboveTitle) {
    links.push(action('keep-with', `Link to ${aboveTitle}`, nativeMenuIcons.group));
  }

  const goTo = row.sourceTrack ? [action('go-to-show', 'Go to Show', nativeMenuIcons.goTo)] : [];
  const actions = editable
    ? menuSections([
        playback,
        guideActions(row, at.group, at.inGroup),
        moves,
        [...links, ...goTo],
        [action('remove', 'Remove from Playlist', nativeMenuIcons.delete, true)],
      ])
    : menuSections([playback, goTo]);
  const editText = (target: GuideTextPlace) =>
    openGuideTextEditor(router, { ...target, playlistId } as GuideTextTarget);

  const handle = (id: string) => {
    switch (id) {
      case 'play-next':
      case 'add-to-queue': {
        const track = queueTrackFor(playlistId, row);
        if (id === 'play-next') {
          player.queue.queueNextTrack([track]);
        } else player.queue.addTrackToEndOfQueue([track]);
        return;
      }
      case 'move-up':
      case 'move-down':
        return toast(
          moveEntryStep(realm, playlistId, entryId, id === 'move-up' ? 'up' : 'down'),
          `Moved ${title}`
        );
      case 'move-top':
      case 'move-bottom':
        return toast(
          moveEntryToEdge(realm, playlistId, entryId, id === 'move-top' ? 'top' : 'bottom'),
          `Moved ${title} to the ${id === 'move-top' ? 'top' : 'bottom'}`
        );
      case 'take-out':
        return toast(takeOutOfGroup(realm, playlistId, entryId), `Unlinked ${title}`);
      case 'unlink-all':
        return toast(ungroup(realm, playlistId, at.group!.segment.segmentId), 'Unlinked');
      case 'keep-with':
        return toast(keepWithAbove(realm, playlistId, entryId), `Linked ${title} to ${aboveTitle}`);
      case 'go-to-show':
        return goToShow(row.sourceTrack!);
      case 'note':
        return editText({ kind: 'entry', entryId });
      case 'add-text-below':
        // Inside a linked group the text stays with it; after a lone track it
        // becomes its own text section, so the track stays unlinked.
        return editText(
          at.inGroup
            ? { kind: 'text', segmentId: at.group!.segment.segmentId, afterEntryId: entryId }
            : { kind: 'section', afterSegmentId: at.group!.segment.segmentId }
        );
      case 'group-intro':
        return editText({ kind: 'segment', segmentId: at.group!.segment.segmentId });
      case 'remove':
        return toast(removeEntry(realm, playlistId, entryId), removedMessage(row, at.group!));
    }
  };

  return (
    <NativeMenuView
      actions={actions}
      style={style}
      title={at.inGroup ? `Linked with ${entryTitle(groupmate)}` : undefined}
      onPressAction={({ nativeEvent }) => handle(nativeEvent.event)}
    >
      {children}
    </NativeMenuView>
  );
}

/**
 * Writing actions for an entry: its note (or a text block's text), text below
 * it, and an intro for its linked group when it has none yet.
 */
function guideActions(
  row: PlaylistRowEntry,
  group: PlaylistRowGroup | undefined,
  inGroup: boolean
): MenuAction[] {
  const actions: MenuAction[] = [];
  if (row.status === 'text') {
    actions.push(action('note', 'Edit Note…', nativeMenuIcons.edit));
  } else {
    actions.push(
      action('note', row.entry.description ? 'Edit Note…' : 'Add Note…', nativeMenuIcons.edit)
    );
  }
  actions.push(action('add-text-below', 'Add Text Below…', nativeMenuIcons.add));
  if (inGroup && group && !group.segment.description) {
    actions.push(action('group-intro', 'Add Intro to Linked Tracks…', nativeMenuIcons.add));
  }
  return actions;
}

/** The menu for a run of linked tracks, on its line in edit mode. */
export function GroupMenu({
  playlistId,
  layout,
  group,
  style,
  children,
}: {
  playlistId: string;
  layout: PlaylistLayout;
  group: PlaylistRowGroup;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const realm = useRealm();
  const player = useRelistenPlayer();
  const online = useShouldMakeNetworkRequests();
  const toast = (changed: boolean, message: string) =>
    toastEdit(realm, playlistId, changed, message);
  const goToShow = useGoToShow();
  const segmentId = group.segment.segmentId;
  const groupCount = layout.groups.length;
  const index = layout.groupIndexes.get(segmentId) ?? -1;
  const showTrack = singleSourceTrack(group.entries);

  const moves: MenuAction[] = [];
  if (index > 0) {
    moves.push(action('move-up', 'Move Up', nativeMenuIcons.moveUp));
  }
  if (index < groupCount - 1) {
    moves.push(action('move-down', 'Move Down', nativeMenuIcons.moveDown));
  }
  if (index > 0) {
    moves.push(action('move-top', 'Move to Top', nativeMenuIcons.moveToTop));
  }
  if (index < groupCount - 1) {
    moves.push(action('move-bottom', 'Move to Bottom', nativeMenuIcons.moveToBottom));
  }

  const links: MenuAction[] = [action('ungroup', 'Unlink All', nativeMenuIcons.ungroup)];
  if (showTrack) {
    links.push(action('go-to-show', 'Go to Show', nativeMenuIcons.goTo));
  }

  const actions = menuSections([
    [action('play-group', 'Play Linked Tracks', nativeMenuIcons.play)],
    moves,
    links,
    [action('remove', 'Remove Linked Tracks', nativeMenuIcons.delete, true)],
  ]);

  const handle = (id: string) => {
    switch (id) {
      case 'play-group': {
        const tracks = queueTracksFor(playlistId, [group], online);
        if (tracks.length > 0) {
          player.queue.replaceQueue(tracks, 0, { resetShuffle: true });
        } else {
          showToast(
            online
              ? 'These recordings aren’t available right now.'
              : 'These tracks aren’t downloaded.'
          );
        }
        return;
      }
      case 'move-up':
      case 'move-down':
        return toast(
          moveSegmentStep(realm, playlistId, segmentId, id === 'move-up' ? 'up' : 'down'),
          'Moved linked tracks'
        );
      case 'move-top':
      case 'move-bottom':
        return toast(
          moveSegmentToEdge(realm, playlistId, segmentId, id === 'move-top' ? 'top' : 'bottom'),
          `Moved linked tracks to the ${id === 'move-top' ? 'top' : 'bottom'}`
        );
      case 'ungroup':
        return toast(ungroup(realm, playlistId, segmentId), 'Unlinked');
      case 'go-to-show':
        return goToShow(showTrack!);
      case 'remove':
        return toast(
          removeSegment(realm, playlistId, segmentId),
          `Removed ${group.entries.length} tracks`
        );
    }
  };

  return (
    <NativeMenuView
      actions={actions}
      style={style}
      onPressAction={({ nativeEvent }) => handle(nativeEvent.event)}
    >
      {children}
    </NativeMenuView>
  );
}
