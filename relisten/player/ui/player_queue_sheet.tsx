import { RelistenText } from '@/relisten/components/relisten_text';
import { listeningHistoryPreview } from '@/relisten/history/listening_history_preview';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import {
  useRelistenPlayerCurrentTrack,
  useRelistenPlayerQueueOrderedTracks,
} from '@/relisten/player/relisten_player_queue_hooks';
import { PlayerHistoryItem } from '@/relisten/player/ui/player_history_item';
import { PlayerNowPlaying } from '@/relisten/player/ui/player_now_playing';
import {
  PLAYER_PANEL_BACKGROUND,
  PLAYER_PANEL_BORDER_COLOR,
  PlayerPanelRow,
} from '@/relisten/player/ui/player_panel_row';
import {
  EarlierQueueItem,
  type QueueTimelineEntry,
  UpNextQueueItem,
} from '@/relisten/player/ui/player_queue_row';
import { PlayerTimelineBoundary } from '@/relisten/player/ui/player_timeline_boundary';
import { ReturnToNowPlayingButton } from '@/relisten/player/ui/return_to_now_playing_button';
import { UpNextHeader } from '@/relisten/player/ui/up_next_header';
import { playerPresentationProgress } from '@/relisten/player/ui/player_presentation';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { useQuery } from '@/relisten/realm/schema';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  FlatList,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import ReorderableList from 'react-native-reorderable-list';
import { ReorderableListReorderEvent } from 'react-native-reorderable-list/src/types/props';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

const HISTORY_PREVIEW_LIMIT = 10;

type TimelineItem =
  | { kind: 'view-all-history' }
  | {
      entry: PlaybackHistoryEntry;
      isFirst: boolean;
      isLast: boolean;
      kind: 'history';
    }
  | { icon: 'history' | 'queue-music'; id: string; kind: 'boundary'; label: string }
  | { entry: QueueTimelineEntry; kind: 'earlier-queue' }
  | { kind: 'now-playing' }
  | { count: number; kind: 'up-next-header' }
  | { entry: QueueTimelineEntry; kind: 'up-next' }
  | { kind: 'empty-up-next' };

type PlayerQueueSheetProps = {
  isPresentedOverlay: boolean;
  onOpenHistory: () => void;
  onQueueHeaderActiveChange: (active: boolean) => void;
  onViewHistoryShow: (entry: PlaybackHistoryEntry) => void;
  usesTransparentHeader: boolean;
};

function timelineItemKey(item: TimelineItem) {
  switch (item.kind) {
    case 'view-all-history':
    case 'now-playing':
    case 'up-next-header':
    case 'empty-up-next':
      return item.kind;
    case 'history':
      return `history-${item.entry.uuid}`;
    case 'boundary':
      return `boundary-${item.id}`;
    case 'earlier-queue':
    case 'up-next':
      return `${item.kind}-${item.entry.queueTrack.identifier}`;
  }
}

export function PlayerQueueSheet({
  isPresentedOverlay,
  onOpenHistory,
  onQueueHeaderActiveChange,
  onViewHistoryShow,
  usesTransparentHeader,
}: PlayerQueueSheetProps) {
  'use no memo';

  const player = useRelistenPlayer();
  const { fontScale, height } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);
  const orderedQueueTracks = useRelistenPlayerQueueOrderedTracks();
  const currentTrack = useRelistenPlayerCurrentTrack();
  const listRef = useRef<FlatList<TimelineItem>>(null);
  const listContainerRef = useRef<View>(null);
  const nowPlayingRef = useRef<View>(null);
  const nowPlayingHeadingRef = useRef<View>(null);
  const hasAnchored = useRef(false);
  const anchorMeasurementPending = useRef(false);
  const pivotOffsetRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isPivotOffscreen, setIsPivotOffscreen] = useState(false);
  const scrollOffset = useSharedValue(0);
  const pivotOffset = useSharedValue(0);
  const anchorReady = useSharedValue(false);
  const anchorAwaitingInitialScroll = useSharedValue(false);
  const hasUserInteracted = useSharedValue(false);
  const recentlyPlayed = useQuery(
    {
      type: PlaybackHistoryEntry,
      query: (query) => query.sorted('playbackStartedAt', true),
    },
    []
  );

  const currentIndex = useMemo(
    () =>
      currentTrack
        ? orderedQueueTracks.findIndex((track) => track.identifier === currentTrack.identifier)
        : -1,
    [currentTrack, orderedQueueTracks]
  );

  const earlierQueueEntries = useMemo<QueueTimelineEntry[]>(() => {
    const earlierTracks = currentIndex > 0 ? orderedQueueTracks.slice(0, currentIndex) : [];
    return earlierTracks.map((queueTrack, queueIndex) => ({
      isFirst: queueIndex === 0,
      isLast: queueIndex === earlierTracks.length - 1,
      queueIndex,
      queueTrack,
    }));
  }, [currentIndex, orderedQueueTracks]);

  const upNextEntries = useMemo<QueueTimelineEntry[]>(() => {
    const firstIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
    const tracks = orderedQueueTracks.slice(firstIndex);
    return tracks.map((queueTrack, offset) => ({
      isFirst: offset === 0,
      isLast: offset === tracks.length - 1,
      queueIndex: firstIndex + offset,
      queueTrack,
    }));
  }, [currentIndex, orderedQueueTracks]);

  const historyPreview = useMemo(() => {
    const activeSourceTrackUuids = new Set(
      orderedQueueTracks.map((track) => track.sourceTrack.uuid)
    );
    return listeningHistoryPreview(
      recentlyPlayed,
      activeSourceTrackUuids,
      HISTORY_PREVIEW_LIMIT
    ).reverse();
  }, [orderedQueueTracks, recentlyPlayed, recentlyPlayed.length]);

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    if (recentlyPlayed.length > 0) items.push({ kind: 'view-all-history' });
    items.push(
      ...historyPreview.map((entry, index) => ({
        entry,
        isFirst: index === 0,
        isLast: index === historyPreview.length - 1,
        kind: 'history' as const,
      }))
    );
    if (historyPreview.length > 0) {
      items.push({
        icon: 'history',
        id: 'listening',
        kind: 'boundary',
        label: 'Earlier Listening',
      });
    }
    items.push(...earlierQueueEntries.map((entry) => ({ entry, kind: 'earlier-queue' as const })));
    if (earlierQueueEntries.length > 0) {
      items.push({
        icon: 'queue-music',
        id: 'queue',
        kind: 'boundary',
        label: 'Earlier in Queue',
      });
    }
    items.push({ kind: 'now-playing' }, { count: upNextEntries.length, kind: 'up-next-header' });
    if (upNextEntries.length > 0) {
      items.push(...upNextEntries.map((entry) => ({ entry, kind: 'up-next' as const })));
    } else {
      items.push({ kind: 'empty-up-next' });
    }
    return items;
  }, [earlierQueueEntries, historyPreview, recentlyPlayed.length, upNextEntries]);

  const pivotIndex = useMemo(
    () => timelineItems.findIndex((item) => item.kind === 'now-playing'),
    [timelineItems]
  );

  const itemLayouts = useMemo(() => {
    let offset = 0;
    return timelineItems.map((item, index) => {
      let length: number;
      switch (item.kind) {
        case 'view-all-history':
        case 'boundary':
          length = 44 * controlScale;
          break;
        case 'history':
          length = 66 * controlScale;
          break;
        case 'earlier-queue':
          length = 51 * controlScale;
          break;
        case 'up-next':
          length = 66 * controlScale;
          break;
        case 'now-playing':
          length = height * 0.64;
          break;
        case 'up-next-header':
          length = 68 * controlScale;
          break;
        case 'empty-up-next':
          length = 80 * controlScale;
          break;
      }
      const layout = { index, length, offset };
      offset += length;
      return layout;
    });
  }, [controlScale, height, timelineItems]);

  const applyScrollOffset = useCallback(
    (offset: number) => {
      listRef.current?.scrollToOffset({ animated: false, offset });
      scrollOffset.value = offset;
    },
    [scrollOffset]
  );

  const focusNowPlaying = useCallback(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then((isScreenReaderEnabled) => {
      if (!isScreenReaderEnabled) return;

      requestAnimationFrame(() => {
        const handle = findNodeHandle(nowPlayingHeadingRef.current);
        if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
      });
    });
  }, []);

  const reconcilePivot = useCallback(
    (reveal: boolean) => {
      if (anchorMeasurementPending.current) return;
      const pivot = nowPlayingRef.current;
      const container = listContainerRef.current;
      if (!pivot || !container) return;

      anchorMeasurementPending.current = true;
      requestAnimationFrame(() => {
        pivot.measureInWindow((_pivotX, pivotY) => {
          container.measureInWindow((_containerX, containerY) => {
            anchorMeasurementPending.current = false;
            const previousPivotOffset = pivotOffsetRef.current;
            const currentOffset = scrollOffset.value;
            const nextPivotOffset = Math.max(0, currentOffset + pivotY - containerY);
            pivotOffsetRef.current = nextPivotOffset;
            pivotOffset.value = nextPivotOffset;

            if (reveal || currentOffset >= previousPivotOffset - 1) {
              applyScrollOffset(
                reveal ? nextPivotOffset : currentOffset + nextPivotOffset - previousPivotOffset
              );
            }

            anchorReady.value = true;
            if (reveal) {
              anchorAwaitingInitialScroll.value = true;
              hasAnchored.current = true;
              requestAnimationFrame(focusNowPlaying);
            }
          });
        });
      });
    },
    [
      anchorAwaitingInitialScroll,
      anchorReady,
      applyScrollOffset,
      focusNowPlaying,
      pivotOffset,
      scrollOffset,
    ]
  );

  const prePivotSignature = useMemo(
    () => timelineItems.slice(0, pivotIndex).map(timelineItemKey).join('|'),
    [pivotIndex, timelineItems]
  );

  useEffect(() => {
    if (hasAnchored.current) reconcilePivot(false);
  }, [currentTrack?.identifier, prePivotSignature, reconcilePivot]);

  useAnimatedReaction(
    () => isPresentedOverlay && playerPresentationProgress.value >= 0.999,
    (isFullyPresented, wasFullyPresented) => {
      if (isFullyPresented && !wasFullyPresented && !hasUserInteracted.value) {
        runOnJS(reconcilePivot)(false);
      }
    }
  );

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const nextOffset = event.contentOffset.y;
      scrollOffset.value = nextOffset;
      if (
        anchorAwaitingInitialScroll.value &&
        anchorReady.value &&
        Math.abs(nextOffset - pivotOffset.value) > 1
      ) {
        anchorAwaitingInitialScroll.value = false;
        runOnJS(reconcilePivot)(true);
      }
    },
  });

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<TimelineItem>[] }) => {
      if (!hasAnchored.current) return;
      setIsPivotOffscreen(
        !viewableItems.some(({ isViewable, item }) => isViewable && item.kind === 'now-playing')
      );
    },
    []
  );

  useEffect(() => {
    onQueueHeaderActiveChange(isPivotOffscreen);
  }, [isPivotOffscreen, onQueueHeaderActiveChange]);

  const nowPlayingStyle = useAnimatedStyle(() => {
    if (!anchorReady.value) return { transform: [{ translateY: 0 }], zIndex: 0 };
    const relativeOffset = Math.max(scrollOffset.value - pivotOffset.value, 0);
    return {
      transform: [{ translateY: Math.min(relativeOffset * 0.78, height * 0.16) }],
      zIndex: 0,
    };
  });

  const triggerHaptics = useCallback(() => {
    'worklet';
    runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleDragEnd = useCallback(() => {
    'worklet';
    runOnJS(setIsDragging)(false);
    runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const onReorder = ({ from, to }: ReorderableListReorderEvent) => {
    setIsDragging(false);
    const fromItem = timelineItems[from];
    const toItem = timelineItems[to];
    if (fromItem?.kind === 'up-next' && toItem?.kind === 'up-next') {
      player.queue.moveQueueTrack(fromItem.entry.queueIndex, toItem.entry.queueIndex);
    }
  };

  const returnToNowPlaying = useCallback(() => {
    applyScrollOffset(pivotOffsetRef.current);
    AccessibilityInfo.announceForAccessibility('Returned to Now Playing');
    focusNowPlaying();
  }, [applyScrollOffset, focusNowPlaying]);

  const renderItem = useCallback(
    ({ item }: { item: TimelineItem }) => {
      switch (item.kind) {
        case 'view-all-history':
          return (
            <PlayerTimelineBoundary
              accessibilityHint="Opens your complete listening history."
              icon="history"
              label="View All Listening History"
              onPress={onOpenHistory}
            />
          );
        case 'history':
          return (
            <PlayerHistoryItem
              entry={item.entry}
              isFirst={item.isFirst}
              isLast={item.isLast}
              onViewShow={() => onViewHistoryShow(item.entry)}
            />
          );
        case 'boundary':
          return <PlayerTimelineBoundary icon={item.icon} label={item.label} />;
        case 'earlier-queue':
          return <EarlierQueueItem entry={item.entry} />;
        case 'now-playing':
          return (
            <Animated.View
              ref={nowPlayingRef}
              onLayout={() => {
                if (!hasAnchored.current) reconcilePivot(true);
              }}
              style={nowPlayingStyle}
            >
              <PlayerNowPlaying headingRef={nowPlayingHeadingRef} />
            </Animated.View>
          );
        case 'up-next-header':
          return <UpNextHeader count={item.count} />;
        case 'up-next':
          return <UpNextQueueItem entry={item.entry} onReorderStart={() => setIsDragging(true)} />;
        case 'empty-up-next':
          return (
            <PlayerPanelRow isFirst isLast>
              <View style={{ padding: 24 }}>
                <RelistenText className="text-center text-gray-300" selectable={false}>
                  Nothing else is queued
                </RelistenText>
              </View>
            </PlayerPanelRow>
          );
      }
    },
    [nowPlayingStyle, onOpenHistory, onViewHistoryShow, reconcilePivot]
  );

  if (!currentTrack) return <View style={{ flex: 1 }} />;

  return (
    <View collapsable={false} ref={listContainerRef} style={{ flex: 1 }}>
      <ReorderableList
        ref={listRef}
        alwaysBounceVertical
        contentInsetAdjustmentBehavior={usesTransparentHeader ? 'automatic' : 'never'}
        data={timelineItems}
        getItemLayout={(_data, index) => itemLayouts[index]}
        initialNumToRender={12}
        initialScrollIndex={pivotIndex}
        keyExtractor={timelineItemKey}
        ListFooterComponent={
          <View style={{ backgroundColor: PLAYER_PANEL_BACKGROUND, height: 1 }}>
            <View
              pointerEvents="none"
              style={{
                backgroundColor: PLAYER_PANEL_BACKGROUND,
                borderColor: PLAYER_PANEL_BORDER_COLOR,
                borderLeftWidth: 1,
                borderRightWidth: 1,
                height,
                left: 0,
                position: 'absolute',
                right: 0,
                top: 0,
              }}
            />
          </View>
        }
        onDragEnd={handleDragEnd}
        onDragStart={triggerHaptics}
        onIndexChange={triggerHaptics}
        onReorder={onReorder}
        onScroll={handleScroll}
        onScrollBeginDrag={() => {
          anchorAwaitingInitialScroll.value = false;
          hasUserInteracted.value = true;
          setIsDragging(false);
        }}
        onViewableItemsChanged={handleViewableItemsChanged}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        viewabilityConfig={{ itemVisiblePercentThreshold: 1 }}
      />
      <ReturnToNowPlayingButton
        onPress={returnToNowPlaying}
        visible={isPivotOffscreen && !isDragging}
      />
    </View>
  );
}
