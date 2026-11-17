import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { RelistenBlue } from '@/relisten/relisten_blue';
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
} from '@/relisten/playlists/playlist_actions';
import {
  trackDropAt,
  trackRows,
  type ArrangeMode,
  type EditRow,
} from '@/relisten/playlists/playlist_edit_rows';
import type { PlaylistRowGroup } from '@/relisten/playlists/playlist_hooks';
import {
  GroupMenu,
  singleSourceTrack,
  trackTitle,
  TrackMenu,
} from '@/relisten/playlists/ui/playlist_menus';
import { groupLabel, showLine } from '@/relisten/playlists/ui/playlist_rows';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';

export type { ArrangeMode } from '@/relisten/playlists/playlist_edit_rows';

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
                <View className="min-h-[44px] justify-center">
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
            <EditableRowFrame isActive={isActive} variant="group">
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
            <EditableRowFrame isActive={isActive} variant={item.inGroup ? 'inCard' : 'loose'}>
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
              <TrackMenu
                playlistId={playlistId}
                groups={groups}
                row={item.row}
                style={{ flex: 1, minWidth: 0, alignSelf: 'stretch' }}
              >
                <View className="min-w-0 flex-1 justify-center py-2">
                  <RelistenText className="text-lg" numberOfLines={1} selectable={false}>
                    {item.row.sourceTrack ? title : 'Track'}
                  </RelistenText>
                  {item.row.sourceTrack && !(item.inGroup && singleSourceTrack(item.group)) && (
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

/** A draggable row. Rows inside a group continue the group card's side borders. */
function EditableRowFrame({
  isActive,
  variant,
  children,
}: {
  isActive: boolean;
  variant: 'loose' | 'inCard' | 'group';
  children: React.ReactNode;
}) {
  return <View style={[styles.row, styles[variant], isActive && styles.active]}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center' },
  loose: { marginHorizontal: 4 },
  inCard: {
    marginHorizontal: 12,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: RelistenBlue[800],
    backgroundColor: RelistenBlue[950],
  },
  group: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: RelistenBlue[800],
  },
  active: {
    borderWidth: 1,
    borderRadius: 8,
    borderColor: RelistenBlue[400],
    backgroundColor: RelistenBlue[800],
  },
});

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
