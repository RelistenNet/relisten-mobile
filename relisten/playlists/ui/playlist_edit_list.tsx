import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import { Pressable, TouchableOpacity, View } from 'react-native';
import DraggableFlatList, { type RenderItem } from 'react-native-draggable-flatlist';
import { RelistenText } from '@/relisten/components/relisten_text';
import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';
import { useRealm } from '@/relisten/realm/schema';
import {
  dropSegment,
  dropTrack,
  keepWithAbove,
  removeEntry,
  undoLastEdit,
  type TrackDrop,
} from '@/relisten/playlists/playlist_actions';
import type { PlaylistRowEntry, PlaylistRowGroup } from '@/relisten/playlists/playlist_hooks';
import { GroupMenu, trackTitle, TrackMenu } from '@/relisten/playlists/ui/playlist_menus';
import { groupLabel, showLine } from '@/relisten/playlists/ui/playlist_rows';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';
import { tw } from '@/relisten/util/tw';

export type ArrangeMode = 'tracks' | 'groups';

/**
 * Edit-mode rows. In Tracks mode a group is bracketed by a header and a footer
 * row, so where a dragged track lands is unambiguous: after a header or before a
 * footer is inside the group; anywhere else is not in a group. In Groups mode
 * every group is one row and drags as a unit.
 */
type EditRow =
  | { key: string; kind: 'header'; group: PlaylistRowGroup }
  | { key: string; kind: 'entry'; group: PlaylistRowGroup; row: PlaylistRowEntry; inGroup: boolean }
  | { key: string; kind: 'footer'; group: PlaylistRowGroup }
  | { key: string; kind: 'group'; group: PlaylistRowGroup };

function trackRows(groups: PlaylistRowGroup[]): EditRow[] {
  const rows: EditRow[] = [];
  for (const group of groups) {
    const inGroup = group.entries.length > 1;
    const id = group.segment.segmentId;
    if (inGroup) rows.push({ key: `h:${id}`, kind: 'header', group });
    for (const row of group.entries) {
      rows.push({ key: row.entry.entryId, kind: 'entry', group, row, inGroup });
    }
    if (inGroup) rows.push({ key: `f:${id}`, kind: 'footer', group });
  }
  return rows;
}

/** Reads the drop from the rows around where the track landed. */
function trackDropAt(rows: EditRow[], index: number): TrackDrop {
  const prev = rows[index - 1];
  const next = rows[index + 1];

  if (prev?.kind === 'header') {
    return {
      kind: 'in_group',
      segmentId: prev.group.segment.segmentId,
      beforeEntryId: next?.kind === 'entry' ? next.row.entry.entryId : undefined,
    };
  }
  if (
    prev?.kind === 'entry' &&
    prev.inGroup &&
    (next?.kind === 'footer' || (next?.kind === 'entry' && next.group === prev.group))
  ) {
    return {
      kind: 'in_group',
      segmentId: prev.group.segment.segmentId,
      afterEntryId: prev.row.entry.entryId,
    };
  }
  return {
    kind: 'not_in_group',
    afterSegmentId: prev ? prev.group.segment.segmentId : undefined,
    beforeSegmentId: next ? next.group.segment.segmentId : undefined,
  };
}

export function PlaylistEditList({
  playlistId,
  groups,
  mode,
  header,
}: {
  playlistId: string;
  groups: PlaylistRowGroup[];
  mode: ArrangeMode;
  header: ReactElement;
}) {
  const realm = useRealm();
  const [dragging, setDragging] = useState(false);
  const scrollProps = usePlayerBottomScrollViewProps({});
  const rows = useMemo<EditRow[]>(
    () =>
      mode === 'tracks'
        ? trackRows(groups)
        : groups.map((group) => ({ key: group.segment.segmentId, kind: 'group' as const, group })),
    [groups, mode]
  );

  const undoToast = useCallback(
    (message: string, extra?: { label: string; onPress: () => void }) =>
      showPlaylistToast(message, [
        { label: 'Undo', onPress: () => undoLastEdit(realm, playlistId) },
        ...(extra ? [extra] : []),
      ]),
    [realm, playlistId]
  );

  const onDragEnd = useCallback(
    ({ data, from, to }: { data: EditRow[]; from: number; to: number }) => {
      setDragging(false);
      if (from === to) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const moved = data[to];

      if (moved.kind === 'group') {
        dropSegment(realm, playlistId, moved.group.segment.segmentId, {
          afterSegmentId: data[to - 1]?.group.segment.segmentId,
          beforeSegmentId: data[to + 1]?.group.segment.segmentId,
        });
        undoToast('Moved group');
        return;
      }
      if (moved.kind !== 'entry') return;

      const drop = trackDropAt(data, to);
      dropTrack(realm, playlistId, moved.row.entry.entryId, drop);

      // Landing on its own right under another single track is how two tracks
      // become a group by dragging: the toast offers to keep them together.
      const prev = data[to - 1];
      const joinable = drop.kind === 'not_in_group' && prev?.kind === 'entry' && !prev.inGroup;
      undoToast(
        `Moved ${trackTitle(moved.row)}`,
        joinable
          ? {
              label: `Keep with ${trackTitle(prev.row)}`,
              onPress: () => keepWithAbove(realm, playlistId, moved.row.entry.entryId),
            }
          : undefined
      );
    },
    [realm, playlistId, undoToast]
  );

  const renderItem = useCallback<RenderItem<EditRow>>(
    ({ item, drag, isActive }) => {
      switch (item.kind) {
        case 'header':
          return (
            <View className="mx-3 mt-2 rounded-t-xl border-x border-t border-relisten-blue-800 bg-relisten-blue-950 pl-4 pr-1">
              <GroupMenu playlistId={playlistId} groups={groups} group={item.group}>
                <View className="min-h-11 justify-center">
                  <RelistenText
                    className="text-sm text-gray-400"
                    numberOfLines={1}
                    selectable={false}
                  >
                    {groupLabel(item.group)}
                  </RelistenText>
                </View>
              </GroupMenu>
            </View>
          );
        case 'footer':
          return (
            <View className="mx-3 mb-2 h-10 justify-center rounded-b-xl border-x border-b border-relisten-blue-800 bg-relisten-blue-950 px-4">
              {dragging && (
                <View className="h-7 justify-center rounded-md border border-dashed border-relisten-blue-400 px-3">
                  <RelistenText
                    className="text-sm font-semibold text-relisten-blue-300"
                    selectable={false}
                  >
                    End of this group
                  </RelistenText>
                </View>
              )}
            </View>
          );
        case 'group':
          return (
            <EditableRowFrame
              isActive={isActive}
              className="mx-3 my-1 rounded-xl border border-relisten-blue-800"
            >
              <View className="min-w-0 flex-1 py-3 pl-3">
                <RelistenText className="font-semibold" numberOfLines={1} selectable={false}>
                  {item.group.entries.length > 1
                    ? groupLabel(item.group)
                    : trackTitle(item.group.entries[0])}
                </RelistenText>
                {item.group.entries.length > 1 && (
                  <RelistenText
                    className="text-sm text-gray-400"
                    numberOfLines={1}
                    selectable={false}
                  >
                    {item.group.entries.map(trackTitle).join(', ')}
                  </RelistenText>
                )}
              </View>
              <DragHandle drag={drag} label={groupLabel(item.group)} />
            </EditableRowFrame>
          );
        case 'entry': {
          const title = trackTitle(item.row);
          return (
            <EditableRowFrame
              isActive={isActive}
              className={
                item.inGroup
                  ? 'mx-3 border-x border-relisten-blue-800 bg-relisten-blue-950'
                  : 'mx-1'
              }
            >
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Remove ${title}`}
                className="h-11 w-11 items-center justify-center"
                onPress={() => {
                  const shrinks = item.inGroup && item.group.entries.length === 2;
                  const mate = item.group.entries.find(
                    (r) => r.entry.entryId !== item.row.entry.entryId
                  );
                  removeEntry(realm, playlistId, item.row.entry.entryId);
                  undoToast(
                    shrinks
                      ? `Removed ${title}. ${trackTitle(mate)} is now on its own.`
                      : `Removed ${title}`
                  );
                }}
              >
                <Ionicons name="remove-circle" size={22} color="#e5484d" />
              </TouchableOpacity>
              <TrackMenu playlistId={playlistId} groups={groups} row={item.row}>
                <View className="min-w-0 flex-1 py-2">
                  <RelistenText className="text-lg" numberOfLines={1} selectable={false}>
                    {item.row.sourceTrack ? title : 'Track'}
                  </RelistenText>
                  {item.row.sourceTrack && (
                    <RelistenText
                      className="text-sm text-gray-400"
                      numberOfLines={1}
                      selectable={false}
                    >
                      {showLine(item.row)}
                    </RelistenText>
                  )}
                </View>
              </TrackMenu>
              <DragHandle drag={drag} label={title} />
            </EditableRowFrame>
          );
        }
      }
    },
    [dragging, groups, playlistId, realm, undoToast]
  );

  return (
    <DraggableFlatList
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={renderItem}
      ListHeaderComponent={header}
      onDragBegin={() => {
        setDragging(true);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }}
      onPlaceholderIndexChange={() => void Haptics.selectionAsync()}
      onDragEnd={onDragEnd}
      activationDistance={0}
      autoscrollThreshold={80}
      autoscrollSpeed={120}
      containerStyle={{ flex: 1 }}
      contentContainerStyle={scrollProps.contentContainerStyle}
      contentInsetAdjustmentBehavior={scrollProps.contentInsetAdjustmentBehavior}
      scrollIndicatorInsets={scrollProps.scrollIndicatorInsets}
    />
  );
}

function EditableRowFrame({
  isActive,
  className,
  children,
}: {
  isActive: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      className={tw('min-h-[52px] flex-row items-center', className, {
        'rounded-lg border border-relisten-blue-400 bg-relisten-blue-800': isActive,
      })}
    >
      {children}
    </View>
  );
}

/** Starts a drag on touch, with no long-press delay. */
function DragHandle({ drag, label }: { drag: () => void; label: string }) {
  return (
    <Pressable
      accessibilityLabel={`Reorder ${label}`}
      accessibilityHint="Use the row's menu to move it without dragging."
      className="h-11 w-11 items-center justify-center"
      onPressIn={drag}
    >
      <MaterialIcons color="rgba(255, 255, 255, 0.62)" name="drag-handle" size={24} />
    </Pressable>
  );
}
