import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { NativeMenuView, type MenuAction } from '@/relisten/components/menus/native_menu_view';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
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
  undoLastEdit,
  ungroup,
} from '@/relisten/playlists/playlist_actions';
import type { PlaylistRowEntry, PlaylistRowGroup } from '@/relisten/playlists/playlist_hooks';
import { queueTracksFor } from '@/relisten/playlists/playlist_playback';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';
import { useGroupSegment } from '@/relisten/util/routes';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

export const trackTitle = (row: PlaylistRowEntry | undefined) => row?.sourceTrack?.title ?? 'track';

/** Where a row sits, which decides which moves make sense. */
function position(groups: PlaylistRowGroup[], entryId: string) {
  const groupIndex = groups.findIndex((g) => g.entries.some((r) => r.entry.entryId === entryId));
  const group = groups[groupIndex];
  const index = group?.entries.findIndex((r) => r.entry.entryId === entryId) ?? -1;
  return { groupIndex, group, index, inGroup: (group?.entries.length ?? 0) > 1 };
}

function useEditToast(playlistId: string) {
  const realm = useRealm();
  return (message: string) =>
    showPlaylistToast(message, [{ label: 'Undo', onPress: () => undoLastEdit(realm, playlistId) }]);
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

/** The menu for one track: playback, moves, grouping, then Remove. Shown in view and edit modes. */
export function TrackMenu({
  playlistId,
  groups,
  row,
  style,
  children,
}: {
  playlistId: string;
  groups: PlaylistRowGroup[];
  row: PlaylistRowEntry;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const realm = useRealm();
  const player = useRelistenPlayer();
  const toast = useEditToast(playlistId);
  const goToShow = useGoToShow();
  const entryId = row.entry.entryId;
  const title = trackTitle(row);
  const at = position(groups, entryId);
  const above = !at.inGroup && at.groupIndex > 0 ? groups[at.groupIndex - 1] : undefined;
  const aboveTitle = above ? trackTitle(above.entries[above.entries.length - 1]) : undefined;
  const isFirst = at.inGroup ? at.index === 0 : at.groupIndex === 0;
  const isLast = at.inGroup
    ? at.index === (at.group?.entries.length ?? 0) - 1
    : at.groupIndex === groups.length - 1;
  const groupmate = at.inGroup
    ? at.group!.entries.find((r) => r.entry.entryId !== entryId)
    : undefined;

  const actions: MenuAction[] = [];
  if (row.sourceTrack && row.status === 'playable') {
    actions.push(
      action('play-next', 'Play Next', nativeMenuIcons.playNext),
      action('add-to-queue', 'Add to End of Queue', nativeMenuIcons.addToQueue)
    );
  }
  if (!isFirst) actions.push(action('move-up', 'Move Up', nativeMenuIcons.moveUp));
  if (!isLast) actions.push(action('move-down', 'Move Down', nativeMenuIcons.moveDown));
  if (groups.length > 1 || at.inGroup) {
    actions.push(
      action('move-top', 'Move to Top', nativeMenuIcons.moveToTop),
      action('move-bottom', 'Move to Bottom', nativeMenuIcons.moveToBottom)
    );
  }
  if (at.inGroup) actions.push(action('take-out', 'Take Out of Group', nativeMenuIcons.ungroup));
  if (aboveTitle)
    actions.push(action('keep-with', `Keep with ${aboveTitle}`, nativeMenuIcons.group));
  if (row.sourceTrack) actions.push(action('go-to-show', 'Go to Show', nativeMenuIcons.goTo));
  actions.push(action('remove', 'Remove from Playlist', nativeMenuIcons.delete, true));

  const handle = (id: string) => {
    switch (id) {
      case 'play-next':
      case 'add-to-queue': {
        const track = PlayerQueueTrack.fromSourceTrack(row.sourceTrack!);
        if (id === 'play-next') player.queue.queueNextTrack([track]);
        else player.queue.addTrackToEndOfQueue([track]);
        return;
      }
      case 'move-up':
      case 'move-down':
        moveEntryStep(realm, playlistId, entryId, id === 'move-up' ? 'up' : 'down');
        return toast(`Moved ${title}`);
      case 'move-top':
      case 'move-bottom':
        moveEntryToEdge(realm, playlistId, entryId, id === 'move-top' ? 'top' : 'bottom');
        return toast(`Moved ${title} to the ${id === 'move-top' ? 'top' : 'bottom'}`);
      case 'take-out':
        takeOutOfGroup(realm, playlistId, entryId);
        return toast(`Took ${title} out of the group`);
      case 'keep-with':
        keepWithAbove(realm, playlistId, entryId);
        return toast(`Keeping ${title} with ${aboveTitle}`);
      case 'go-to-show':
        return goToShow(row.sourceTrack!);
      case 'remove': {
        const shrinks = at.inGroup && at.group!.entries.length === 2;
        removeEntry(realm, playlistId, entryId);
        return toast(
          shrinks
            ? `Removed ${title}. ${trackTitle(groupmate)} is now on its own.`
            : `Removed ${title}`
        );
      }
    }
  };

  return (
    <NativeMenuView
      actions={actions}
      style={style}
      title={at.inGroup ? `In a group with ${trackTitle(groupmate)}` : undefined}
      onPressAction={({ nativeEvent }) => handle(nativeEvent.event)}
    >
      {children}
    </NativeMenuView>
  );
}

/** The menu for a group header. */
export function GroupMenu({
  playlistId,
  groups,
  group,
  children,
}: {
  playlistId: string;
  groups: PlaylistRowGroup[];
  group: PlaylistRowGroup;
  children: ReactNode;
}) {
  const realm = useRealm();
  const player = useRelistenPlayer();
  const online = useShouldMakeNetworkRequests();
  const toast = useEditToast(playlistId);
  const goToShow = useGoToShow();
  const segmentId = group.segment.segmentId;
  const index = groups.findIndex((g) => g.segment.segmentId === segmentId);
  const showTrack = singleSourceTrack(group);

  const actions: MenuAction[] = [action('play-group', 'Play Group', nativeMenuIcons.play)];
  if (index > 0) actions.push(action('move-up', 'Move Up', nativeMenuIcons.moveUp));
  if (index < groups.length - 1)
    actions.push(action('move-down', 'Move Down', nativeMenuIcons.moveDown));
  if (groups.length > 1) {
    actions.push(
      action('move-top', 'Move to Top', nativeMenuIcons.moveToTop),
      action('move-bottom', 'Move to Bottom', nativeMenuIcons.moveToBottom)
    );
  }
  actions.push(action('ungroup', 'Ungroup', nativeMenuIcons.ungroup));
  if (showTrack) actions.push(action('go-to-show', 'Go to Show', nativeMenuIcons.goTo));
  actions.push(action('remove', 'Remove Group', nativeMenuIcons.delete, true));

  const handle = (id: string) => {
    switch (id) {
      case 'play-group': {
        const tracks = queueTracksFor(playlistId, [group], online);
        if (tracks.length > 0) player.queue.replaceQueue(tracks, 0, { resetShuffle: true });
        return;
      }
      case 'move-up':
      case 'move-down':
        moveSegmentStep(realm, playlistId, segmentId, id === 'move-up' ? 'up' : 'down');
        return toast('Moved group');
      case 'move-top':
      case 'move-bottom':
        moveSegmentToEdge(realm, playlistId, segmentId, id === 'move-top' ? 'top' : 'bottom');
        return toast(`Moved group to the ${id === 'move-top' ? 'top' : 'bottom'}`);
      case 'ungroup':
        ungroup(realm, playlistId, segmentId);
        return toast('Ungrouped');
      case 'go-to-show':
        return goToShow(showTrack!);
      case 'remove':
        removeSegment(realm, playlistId, segmentId);
        return toast(`Removed ${group.entries.length} tracks`);
    }
  };

  return (
    <NativeMenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => handle(nativeEvent.event)}
    >
      {children}
    </NativeMenuView>
  );
}

/** A loaded track when every track in the group comes from the same recording. */
export function singleSourceTrack(group: PlaylistRowGroup): SourceTrack | undefined {
  const first = group.entries[0]?.sourceTrack;
  if (!first) return undefined;
  return group.entries.every((r) => r.sourceTrack?.sourceUuid === first.sourceUuid)
    ? first
    : undefined;
}
