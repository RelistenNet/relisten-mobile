import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  measure,
  runOnJS,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { RelistenText } from '@/relisten/components/relisten_text';
import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useRealm } from '@/relisten/realm/schema';
import { dropSegment, dropTrack, removeEntry } from '@/relisten/playlists/playlist_actions';
import {
  type DragPlan,
  type DropSlot,
  type EditItem,
  type EditMetrics,
  type LinkPosition,
  editItems,
  editMetrics,
  gaplessY,
  itemHeight,
  itemTops,
  nearestSlot,
  planLinkDrag,
  planTrackDrag,
} from '@/relisten/playlists/playlist_drag_slots';
import type { PlaylistLayout } from '@/relisten/playlists/playlist_hooks';
import { trackTitle } from '@/relisten/playlists/playlist_format';
import { GroupMenu, TrackMenu } from '@/relisten/playlists/ui/playlist_menus';
import { LinkRail, linkedLabel, showLine } from '@/relisten/playlists/ui/playlist_rows';
import { removedMessage, toastEdit } from '@/relisten/playlists/ui/playlist_toast';

/**
 * The playlist in edit mode: one list, where every row has a handle.
 *
 * Dragging is done here rather than with a reorder library because a drop has
 * to mean more than a new index: at a link's edge the same spot can be inside
 * or outside the link, and holding over a single track links onto it. The
 * slots come from `playlist_drag_slots`; this file follows the finger, opens a
 * placeholder at the chosen slot and applies the drop.
 *
 * Finger tracking, auto-scroll and slot choice run on the UI thread in a frame
 * callback. React re-renders only when the chosen slot changes.
 */

/*
 * Drag tuning. Distances are in rows, so they hold at every text size; the
 * row height comes from `editMetrics`.
 */
/** Auto-scroll starts this many rows from the top or bottom edge. */
const AUTOSCROLL_EDGE_ROWS = 1.5;
/** Points per frame at the very edge. */
const AUTOSCROLL_MAX_SPEED = 14;
/**
 * The tab bar and mini player float over the bottom of the list. Not every
 * layout reports their height in the scroll insets, so this is the minimum.
 */
const BOTTOM_OBSTRUCTION_FLOOR = 150;
const LINK_HOLD_MS = 600;
/** How much of a single track the dragged row must cover for holding to link onto it. */
const LINK_OVERLAP_ROWS = 0.35;
/** How far the row moves over its placeholder to step to the other slot at the same spot. */
const SEAM_STEP_ROWS = 0.3;

type ListItem = EditItem | { kind: 'gap'; key: 'gap'; slot: DropSlot };

/** The handle column on the right of every row; a touch that starts here starts a drag. */
const HANDLE_WIDTH = 48;

interface DragState {
  kind: 'track' | 'link';
  /** Entry ID for a track; segment ID for a link. */
  id: string;
  plan: DragPlan;
  slot: number;
  /** The row drawn under the finger. */
  dragged: EditItem;
  /** After a drop, the list shows the result until the playlist updates. */
  settlingFrom?: PlaylistLayout;
}

export function PlaylistEditList({
  playlistId,
  layout,
  header,
}: {
  playlistId: string;
  layout: PlaylistLayout;
  header: ReactElement;
}) {
  'use no memo';
  const realm = useRealm();
  const { fontScale } = useWindowDimensions();
  const metrics = useMemo(() => editMetrics(fontScale), [fontScale]);
  const scrollProps = usePlayerBottomScrollViewProps({});
  const listRef = useAnimatedRef<Animated.FlatList<ListItem>>();
  const headerRef = useAnimatedRef<Animated.View>();
  // Content sits under the translucent navigation bar, so the resting offset is negative.
  const topInset = useHeaderHeight();
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const items = useMemo(() => editItems(layout.groups), [layout]);

  // UI-thread state for the drag in progress.
  const active = useSharedValue(0);
  const fingerY = useSharedValue(0);
  const listPageY = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const minScrollY = useSharedValue(-topInset);
  const headerHeight = useSharedValue(0);
  const listHeight = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const bottomObstruction = useSharedValue(0);
  const obstruction = Math.max(
    scrollProps.scrollIndicatorInsets?.bottom ?? 0,
    BOTTOM_OBSTRUCTION_FLOOR
  );
  useEffect(() => {
    bottomObstruction.value = obstruction;
  }, [bottomObstruction, obstruction]);
  const grab = useSharedValue(0);
  const gapHeight = useSharedValue(0);
  const slotYs = useSharedValue<number[]>([]);
  const slotGapTops = useSharedValue<number[]>([]);
  const linkTargets = useSharedValue<boolean[]>([]);
  const hoverTops = useSharedValue<number[]>([]);
  const hoverSlots = useSharedValue<number[]>([]);
  const currentSlot = useSharedValue(-1);
  const hoverIndex = useSharedValue(-1);
  const hoverMs = useSharedValue(0);
  const slotGapIndexes = useSharedValue<number[]>([]);
  const anchorTop = useSharedValue(0);
  // Item positions for hit-testing a touch in the handle column.
  const itemTopsSV = useSharedValue<number[]>([]);
  const itemIdsSV = useSharedValue<string[]>([]);
  const itemIsLinkSV = useSharedValue<boolean[]>([]);
  const touchIndex = useSharedValue(-1);

  useEffect(() => {
    const tops = itemTops(items, metrics);
    const total = items.reduce((sum, item) => sum + itemHeight(item, metrics), 0);
    itemTopsSV.value = [...tops, total];
    itemIdsSV.value = items.map((item) =>
      item.kind === 'track' ? item.row.entry.entryId : item.group.segment.segmentId
    );
    itemIsLinkSV.value = items.map((item) => item.kind === 'link');
  }, [items, metrics]);

  // The playlist changed after a drop: the list now shows the real result.
  useEffect(() => {
    if (drag?.settlingFrom && drag.settlingFrom !== layout) {
      setDrag(null);
    }
  }, [drag, layout]);

  const onSlotChange = useCallback((slot: number) => {
    const current = dragRef.current;
    if (!current) {
      return;
    }
    const armedLink = current.plan.slots[slot]?.linkTarget === true;
    void (armedLink
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      : Haptics.selectionAsync());
    // Updated before React renders, so a drop that follows at once uses this slot.
    dragRef.current = { ...current, slot };
    setDrag(dragRef.current);
  }, []);

  /** Scrolls when the finger is near the top or bottom edge, faster the closer it gets. */
  function autoScroll(): boolean {
    'worklet';
    const relative = fingerY.value - listPageY.value;
    const edge = AUTOSCROLL_EDGE_ROWS * gapHeight.value;
    const bottomEdge = listHeight.value - bottomObstruction.value - edge;
    // The list also runs under the translucent navigation bar.
    const topEdge = -minScrollY.value + edge;
    let delta = 0;
    if (relative < topEdge) {
      delta = -AUTOSCROLL_MAX_SPEED * Math.min(1, (topEdge - relative) / edge);
    } else if (relative > bottomEdge) {
      delta = AUTOSCROLL_MAX_SPEED * Math.min(1, (relative - bottomEdge) / edge);
    }
    if (delta === 0) {
      return false;
    }
    const maxY = Math.max(minScrollY.value, contentHeight.value - listHeight.value);
    const nextY = Math.min(maxY, Math.max(minScrollY.value, scrollY.value + delta));
    if (nextY === scrollY.value) {
      return false;
    }
    scrollTo(listRef, 0, nextY, false);
    scrollY.value = nextY;
    return true;
  }

  /**
   * Holding still over the middle of a single track arms the link onto it.
   * While the row is over its open placeholder, a short move up or down steps
   * to the other slot at that spot (inside or outside a link). Otherwise the
   * nearest slot wins. The hold timer pauses while the list auto-scrolls.
   */
  function chooseSlot(rawTop: number, rowTop: number, scrolling: boolean, elapsed: number): number {
    'worklet';
    // Hover is judged on screen, against where each target is drawn: a target
    // past the open placeholder sits one placeholder lower. Overlap rather than
    // the target's middle is used because the list reflows as the row moves,
    // and partly covering a track holds true on both sides of that reflow.
    const gapTop = slotGapTops.value[currentSlot.value] ?? 0;
    const height = gapHeight.value;
    const targets = hoverTops.value;
    let over = -1;
    for (let i = 0; i < targets.length; i++) {
      const top = targets[i] + (targets[i] >= gapTop ? height : 0);
      if (top > rawTop + height) {
        break; // Targets are in order; the rest are further down.
      }
      const overlap = Math.min(rawTop, top) + height - Math.max(rawTop, top);
      if (overlap >= height * LINK_OVERLAP_ROWS) {
        over = i;
        break;
      }
    }

    if (over < 0) {
      hoverIndex.value = -1;
      hoverMs.value = 0;
    } else if (over !== hoverIndex.value) {
      hoverIndex.value = over;
      hoverMs.value = 0;
    } else if (!scrolling) {
      hoverMs.value += elapsed;
    }

    if (over >= 0 && hoverMs.value >= LINK_HOLD_MS) {
      return hoverSlots.value[over];
    }
    const current = currentSlot.value;
    if (!linkTargets.value[current] && Math.abs(rawTop - gapTop) < height / 2) {
      const moved = rawTop - anchorTop.value;
      const stepDistance = height * SEAM_STEP_ROWS;
      const step = moved > stepDistance ? 1 : moved < -stepDistance ? -1 : 0;
      const neighbor = current + step;
      const sameSpot =
        step !== 0 &&
        slotGapIndexes.value[neighbor] === slotGapIndexes.value[current] &&
        !linkTargets.value[neighbor];
      return sameSpot ? neighbor : current;
    }
    const positional = linkTargets.value[current] ? -1 : current;
    return nearestSlot(slotYs.value, linkTargets.value, rowTop, positional, height);
  }

  const frame = useFrameCallback((info) => {
    if (active.value !== 1 || slotYs.value.length === 0) {
      return;
    }
    const scrolled = autoScroll();
    // Slots are compared with the dragged row's top edge, which is where the
    // row would sit if dropped.
    const top = fingerY.value - listPageY.value + scrollY.value - headerHeight.value - grab.value;
    const gapTop = slotGapTops.value[currentSlot.value] ?? 0;
    const rowTop = gaplessY(top, gapTop, gapHeight.value);
    const next = chooseSlot(top, rowTop, scrolled, info.timeSincePreviousFrame ?? 16);
    if (next !== currentSlot.value) {
      currentSlot.value = next;
      anchorTop.value = top;
      runOnJS(onSlotChange)(next);
    }
  }, false);

  const begin = useCallback(
    (kind: 'track' | 'link', id: string, startFingerY: number, pageY: number) => {
      const plan =
        kind === 'track'
          ? planTrackDrag(layout.groups, id, metrics)
          : planLinkDrag(layout.groups, id, metrics);
      const key = kind === 'track' ? id : `link:${id}`;
      const index = items.findIndex((item) => item.key === key);
      if (index < 0) {
        active.value = 0;
        return;
      }

      const contentY = startFingerY - pageY + scrollY.value - headerHeight.value;
      const planTops = itemTops(plan.items, metrics);
      const planHeight = plan.items.reduce((sum, item) => sum + itemHeight(item, metrics), 0);
      const gapTopOf = (slot: DropSlot) => planTops[slot.gapIndex] ?? planHeight;

      const itemTop = itemTops(items, metrics)[index];
      anchorTop.value = itemTop;
      grab.value = Math.min(plan.gapHeight, Math.max(0, contentY - itemTop));
      gapHeight.value = plan.gapHeight;
      slotYs.value = plan.slots.map((slot) => slot.y);
      slotGapTops.value = plan.slots.map(gapTopOf);
      linkTargets.value = plan.slots.map((slot) => slot.linkTarget === true);
      slotGapIndexes.value = plan.slots.map((slot) => slot.gapIndex);
      hoverTops.value = plan.hoverTargets.map((target) => target.top);
      hoverSlots.value = plan.hoverTargets.map((target) => target.slotIndex);
      currentSlot.value = plan.initialSlot;
      hoverIndex.value = -1;
      hoverMs.value = 0;

      const item = items[index];
      const dragged: EditItem =
        item.kind === 'track'
          ? { ...item, link: undefined }
          : { kind: 'collapsed', key: `collapsed:${id}`, group: item.group };
      setDrag({ kind, id, plan, slot: plan.initialSlot, dragged });
      frame.setActive(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [frame, items, layout, metrics]
  );

  const finish = useCallback(
    (commit: boolean) => {
      frame.setActive(false);
      active.value = 0;
      const current = dragRef.current;
      if (!current || current.settlingFrom) {
        return;
      }

      const slot = current.plan.slots[current.slot];
      const changed = commit && slot ? applyDrop(current, slot) : false;
      if (changed) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setDrag({ ...current, settlingFrom: layout });
      } else {
        setDrag(null);
      }
    },
    [frame, layout]
  );

  function applyDrop(current: DragState, slot: DropSlot): boolean {
    if (slot.drop.kind === 'segment') {
      const changed = dropSegment(realm, playlistId, current.id, slot.drop);
      toastEdit(realm, playlistId, changed, 'Moved linked tracks');
      return changed;
    }

    const dragged = current.dragged as Extract<EditItem, { kind: 'track' }>;
    const title = trackTitle(dragged.row);
    const wasLinked = dragged.group.entries.length > 1;
    const changed = dropTrack(realm, playlistId, current.id, slot.drop.drop);
    const message =
      slot.inLink && !wasLinked
        ? `Linked ${title}`
        : !slot.inLink && wasLinked
          ? `Unlinked ${title}`
          : `Moved ${title}`;
    toastEdit(realm, playlistId, changed, message);
    return changed;
  }

  /**
   * One gesture for the whole list. It claims a touch only when it starts in
   * the handle column, so taps, menus and scrolling elsewhere are untouched.
   * Living on the list rather than on each row matters: the dragged row leaves
   * the list when the drag starts, which would cancel a gesture it owned.
   */
  // The list's own scrolling waits for the drag gesture to fail, which it does
  // at once for any touch outside the handle column.
  const listScroll = useMemo(() => Gesture.Native(), []);
  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .blocksExternalGesture(listScroll)
        .manualActivation(true)
        .shouldCancelWhenOutside(false)
        .onTouchesDown((event, manager) => {
          const touch = event.allTouches[0];
          // Positions are measured, not taken from scroll events: iOS insets
          // the content under the navigation bar without reporting a scroll.
          const list = measure(listRef);
          const listHeader = measure(headerRef);
          if (
            !touch ||
            !list ||
            !listHeader ||
            active.value === 1 ||
            touch.absoluteX < list.pageX + list.width - HANDLE_WIDTH
          ) {
            manager.fail();
            return;
          }
          const y = touch.absoluteY - listHeader.pageY - listHeader.height;
          const tops = itemTopsSV.value;
          let index = -1;
          for (let i = 0; i < tops.length - 1; i++) {
            if (y >= tops[i] && y < tops[i + 1]) {
              index = i;
              break;
            }
          }
          if (index < 0) {
            manager.fail();
            return;
          }
          touchIndex.value = index;
          listPageY.value = list.pageY;
          listHeight.value = list.height;
          headerHeight.value = listHeader.height;
          scrollY.value = list.pageY - listHeader.pageY;
          minScrollY.value = Math.min(-topInset, scrollY.value);
          fingerY.value = touch.absoluteY;
          active.value = 1;
        })
        // Activating on the first move rather than on touch-down lets the
        // gesture finish beginning; the hit test above already decided.
        .onTouchesMove((_event, manager) => {
          if (touchIndex.value >= 0 && active.value === 1) {
            manager.activate();
          }
        })
        .onStart(() => {
          const index = touchIndex.value;
          runOnJS(begin)(
            itemIsLinkSV.value[index] ? 'link' : 'track',
            itemIdsSV.value[index],
            fingerY.value,
            listPageY.value
          );
        })
        .onUpdate((event) => {
          fingerY.value = event.absoluteY;
        })
        .onFinalize((_event, success) => {
          if (active.value === 1) {
            runOnJS(finish)(success);
          }
        }),
    [begin, finish, listScroll, topInset]
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const data = useMemo(() => listData(items, drag), [items, drag]);
  const settlingRow = drag?.settlingFrom ? drag.dragged : undefined;

  const renderItem = useCallback(
    ({ item, index }: { item: ListItem; index: number }) => (
      <EditListRow
        item={item}
        next={data[index + 1]}
        metrics={metrics}
        playlistId={playlistId}
        layout={layout}
        settlingRow={settlingRow}
      />
    ),
    [data, layout, metrics, playlistId, settlingRow]
  );

  const floatingStyle = useAnimatedStyle(() => ({
    top: fingerY.value - listPageY.value - grab.value,
  }));

  return (
    <GestureDetector gesture={dragGesture}>
      <View style={{ flex: 1 }}>
        <GestureDetector gesture={listScroll}>
          <Animated.FlatList
            ref={listRef}
            data={data}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            ListHeaderComponent={<Animated.View ref={headerRef}>{header}</Animated.View>}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            onContentSizeChange={(_, height) => (contentHeight.value = height)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={scrollProps.contentContainerStyle}
            contentInsetAdjustmentBehavior={scrollProps.contentInsetAdjustmentBehavior}
            scrollIndicatorInsets={scrollProps.scrollIndicatorInsets}
          />
        </GestureDetector>
        {drag && !drag.settlingFrom && (
          <Animated.View pointerEvents="none" style={[styles.floating, floatingStyle]}>
            <View style={[styles.lifted, { height: drag.plan.gapHeight }]}>
              <RowContent
                item={drag.dragged}
                metrics={metrics}
                badge={drag.plan.slots[drag.slot]?.label}
              />
            </View>
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}

/** The rows to show: the plain list, or the drag plan's list with the placeholder at the chosen slot. */
function listData(items: EditItem[], drag: DragState | null): ListItem[] {
  if (!drag) {
    return items;
  }
  const slot = drag.plan.slots[drag.slot];
  const rows: ListItem[] = [...drag.plan.items];
  if (slot) {
    rows.splice(slot.gapIndex, 0, { kind: 'gap', key: 'gap', slot });
  }
  return rows;
}

/** How the rail runs through this row, given what comes after it. */
function railFor(item: ListItem, next: ListItem | undefined): LinkPosition | undefined {
  const linkGapNext = next?.kind === 'gap' && next.slot.inLink;
  switch (item.kind) {
    case 'link':
      return 'first';
    case 'collapsed':
      return item.group.entries.length > 1 ? 'only' : undefined;
    case 'gap': {
      if (!item.slot.inLink) {
        return undefined;
      }
      const continues = next?.kind === 'track' && next.link !== undefined && !item.slot.linkTarget;
      return continues ? 'middle' : 'last';
    }
    case 'track':
      if (item.link === undefined) {
        // A single track the drag is about to link onto starts a rail.
        return linkGapNext && next.slot.linkTarget ? 'first' : undefined;
      }
      return item.link === 'last' && !linkGapNext ? 'last' : 'middle';
  }
}

function EditListRow({
  item,
  next,
  metrics,
  playlistId,
  layout,
  settlingRow,
}: {
  item: ListItem;
  next: ListItem | undefined;
  metrics: EditMetrics;
  playlistId: string;
  layout: PlaylistLayout;
  settlingRow: EditItem | undefined;
}) {
  const rail = railFor(item, next);

  if (item.kind === 'gap') {
    return (
      <View style={{ height: metrics.trackHeight }}>
        <LinkRail link={rail} active />
        {settlingRow ? (
          <RowContent item={settlingRow} metrics={metrics} />
        ) : (
          <View style={[styles.placeholder, item.slot.inLink && styles.placeholderInLink]}>
            {item.slot.label && (
              <RelistenText
                className="text-sm font-semibold text-relisten-blue-300"
                numberOfLines={1}
                selectable={false}
              >
                {item.slot.label}
              </RelistenText>
            )}
          </View>
        )}
      </View>
    );
  }

  if (item.kind === 'link') {
    return (
      <View style={{ height: metrics.linkHeight }} className="flex-row items-center">
        <LinkRail link={rail} active={false} />
        <View className="w-12" />
        <GroupMenu
          playlistId={playlistId}
          layout={layout}
          group={item.group}
          style={{ flex: 1, minWidth: 0, alignSelf: 'stretch' }}
        >
          <View className="h-full flex-1 justify-center" accessibilityRole="button">
            <RelistenText className="text-sm text-gray-400" numberOfLines={1} selectable={false}>
              {linkedLabel(item.group)}
            </RelistenText>
          </View>
        </GroupMenu>
        <DragHandle label={linkedLabel(item.group)} />
      </View>
    );
  }

  if (item.kind === 'collapsed') {
    return (
      <View style={{ height: metrics.trackHeight }}>
        <LinkRail link={rail} active={false} />
        <RowContent item={item} metrics={metrics} />
      </View>
    );
  }

  return (
    <View style={{ height: metrics.trackHeight }} className="flex-row items-center">
      <LinkRail link={rail} active={false} />
      <RemoveButton playlistId={playlistId} item={item} />
      <TrackMenu
        playlistId={playlistId}
        layout={layout}
        row={item.row}
        style={{ flex: 1, minWidth: 0, alignSelf: 'stretch' }}
      >
        <TrackText item={item} />
      </TrackMenu>
      <DragHandle label={trackTitle(item.row)} />
    </View>
  );
}

/** The non-interactive body of a row: under the finger, in a folded list, and while settling. */
function RowContent({
  item,
  metrics,
  badge,
}: {
  item: EditItem;
  metrics: EditMetrics;
  /** What dropping here would do, shown on the row under the finger. */
  badge?: string;
}) {
  if (item.kind === 'track') {
    return (
      <View style={{ height: metrics.trackHeight }} className="flex-row items-center">
        <View className="w-12" />
        <TrackText item={item} />
        <View className="w-3" />
        {badge && (
          <RelistenText
            className="max-w-[45%] text-sm font-semibold text-relisten-blue-300"
            numberOfLines={1}
            selectable={false}
          >
            {badge}
          </RelistenText>
        )}
        <View className="w-4" />
      </View>
    );
  }
  const group = item.group;
  const linked = group.entries.length > 1;
  return (
    <View style={{ height: metrics.trackHeight }} className="justify-center pl-12 pr-11">
      <RelistenText className="text-lg" numberOfLines={1} selectable={false}>
        {linked ? linkedLabel(group) : trackTitle(group.entries[0])}
      </RelistenText>
      <RelistenText className="text-sm text-gray-400" numberOfLines={1} selectable={false}>
        {linked ? group.entries.map(trackTitle).join(', ') : showLine(group.entries[0])}
      </RelistenText>
    </View>
  );
}

function TrackText({ item }: { item: Extract<EditItem, { kind: 'track' }> }) {
  const subtitle = showLine(item.row);
  return (
    <View className="min-w-0 flex-1 justify-center">
      <RelistenText className="text-lg" numberOfLines={1} selectable={false}>
        {item.row.sourceTrack ? trackTitle(item.row) : 'Track'}
      </RelistenText>
      {subtitle !== '' && (
        <RelistenText className="text-sm text-gray-400" numberOfLines={1} selectable={false}>
          {subtitle}
        </RelistenText>
      )}
    </View>
  );
}

function RemoveButton({
  playlistId,
  item,
}: {
  playlistId: string;
  item: Extract<EditItem, { kind: 'track' }>;
}) {
  const realm = useRealm();
  const title = trackTitle(item.row);

  const remove = () =>
    toastEdit(
      realm,
      playlistId,
      removeEntry(realm, playlistId, item.row.entry.entryId),
      removedMessage(item.row, item.group)
    );

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Remove ${title}`}
      className="h-11 w-12 items-center justify-center"
      onPress={remove}
    >
      <Ionicons name="remove-circle" size={22} color="#e5484d" />
    </TouchableOpacity>
  );
}

/**
 * The ≡ in a row's handle column. The list's gesture does the dragging; this
 * only marks the spot. VoiceOver users move rows from the row's menu.
 */
function DragHandle({ label }: { label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`Reorder ${label}`}
      accessibilityHint="Use the row's menu to move it without dragging."
      style={{ width: HANDLE_WIDTH }}
      className="h-11 items-center justify-center"
    >
      <MaterialIcons color="rgba(255, 255, 255, 0.62)" name="drag-handle" size={24} />
    </View>
  );
}

const styles = StyleSheet.create({
  floating: { position: 'absolute', left: 0, right: 0 },
  lifted: {
    marginHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: RelistenBlue[400],
    backgroundColor: RelistenBlue[800],
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    transform: [{ scale: 1.02 }],
  },
  placeholder: {
    flex: 1,
    marginVertical: 6,
    marginHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: RelistenBlue[400],
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  placeholderInLink: { marginLeft: 20 },
});
