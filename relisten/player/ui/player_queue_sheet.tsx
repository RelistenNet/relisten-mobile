import { RelistenText } from '@/relisten/components/relisten_text';
import { listeningHistoryPreview } from '@/relisten/history/listening_history_preview';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import {
  useRelistenPlayerCurrentTrack,
  useRelistenPlayerQueueOrderedTracks,
} from '@/relisten/player/relisten_player_queue_hooks';
import { PlayerHistoryItem } from '@/relisten/player/ui/player_history_item';
import { PlayerNowPlaying } from '@/relisten/player/ui/player_now_playing';
import { PlayerPanelRow } from '@/relisten/player/ui/player_panel_row';
import {
  EarlierQueueItem,
  type QueueTimelineEntry,
  UpNextQueueItem,
} from '@/relisten/player/ui/player_queue_row';
import { PlayerTimelineSectionHeader } from '@/relisten/player/ui/player_timeline_section_header';
import { ReturnToNowPlayingButton } from '@/relisten/player/ui/return_to_now_playing_button';
import { usePlayerListDismissal } from '@/relisten/player/ui/use_player_list_dismissal';
import { ViewAllHistoryButton } from '@/relisten/player/ui/view_all_history_button';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { useQuery } from '@/relisten/realm/schema';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  FlatList,
  type LayoutChangeEvent,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DraggableFlatList, {
  type DragEndParams,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

const HISTORY_PREVIEW_LIMIT = 10;
const PIVOT_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 40 } as const;

type ScrollPhase = 'awaiting-momentum' | 'dragging' | 'idle' | 'momentum';

function PlayerTimelineScrollObserver({
  onScroll,
  source,
}: {
  onScroll: (offset: number) => void;
  source: SharedValue<number>;
}) {
  useAnimatedReaction(
    () => source.value,
    (offset) => {
      onScroll(offset);
    },
    [onScroll, source]
  );

  return null;
}

type TimelineItem =
  | { kind: 'view-all-history' }
  | {
      entry: PlaybackHistoryEntry;
      isFirst: boolean;
      isLast: boolean;
      kind: 'history';
    }
  | {
      count?: number;
      icon: 'history' | 'queue-music';
      id: 'listening' | 'queue' | 'up-next';
      kind: 'section-header';
      label: string;
    }
  | { entry: QueueTimelineEntry; kind: 'earlier-queue' }
  | { id: 'before-now-playing' | 'before-queue'; kind: 'sticky-reset' }
  | { kind: 'now-playing' }
  | { entry: QueueTimelineEntry; kind: 'up-next' }
  | { kind: 'empty-up-next' };

type PlayerQueueSheetProps = {
  isPresentedOverlay: boolean;
  onBeforeNavigate: () => void;
  onOpenHistory: () => void;
  onViewHistoryShow: (entry: PlaybackHistoryEntry) => void;
  visualizerActive: boolean;
};

function timelineItemKey(item: TimelineItem) {
  switch (item.kind) {
    case 'view-all-history':
    case 'now-playing':
    case 'empty-up-next':
      return item.kind;
    case 'sticky-reset':
      return `sticky-reset-${item.id}`;
    case 'history':
      return `history-${item.entry.uuid}`;
    case 'section-header':
      return `section-${item.id}`;
    case 'earlier-queue':
    case 'up-next':
      return `${item.kind}-${item.entry.queueTrack.identifier}`;
  }
}

export function PlayerQueueSheet({
  isPresentedOverlay,
  onBeforeNavigate,
  onOpenHistory,
  onViewHistoryShow,
  visualizerActive,
}: PlayerQueueSheetProps) {
  'use no memo';

  const player = useRelistenPlayer();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const orderedQueueTracks = useRelistenPlayerQueueOrderedTracks();
  const currentTrack = useRelistenPlayerCurrentTrack();
  const listRef = useRef<FlatList<TimelineItem>>(null);
  const listContainerRef = useRef<View>(null);
  const nowPlayingRef = useRef<View>(null);
  const nowPlayingHeadingRef = useRef<View>(null);
  const hasAnchored = useRef(false);
  const anchorAttemptStarted = useRef(false);
  const anchorRetryCount = useRef(0);
  const anchorMeasurementPending = useRef(false);
  const pendingPivotReconciliation = useRef(false);
  const reconciliationGeneration = useRef(0);
  const pivotOffsetRef = useRef(0);
  const isPivotOffscreenRef = useRef(false);
  const isQueueDraggingRef = useRef(false);
  const [isAnchorReady, setIsAnchorReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPivotOffscreen, setIsPivotOffscreen] = useState(false);
  const [listViewportHeight, setListViewportHeight] = useState(0);
  const [nativeScrollOffset, setNativeScrollOffset] = useState<SharedValue<number> | null>(null);
  const scrollOffset = useSharedValue(0);
  const effectiveScrollOffset = nativeScrollOffset ?? scrollOffset;
  const pivotOffset = useSharedValue(0);
  const anchorReady = useSharedValue(false);
  const scrollPhaseRef = useRef<ScrollPhase>('idle');
  const recentlyPlayed = useQuery(
    {
      type: PlaybackHistoryEntry,
      query: (query) => query.sorted('playbackStartedAt', true),
    },
    []
  );
  const {
    onScrollBeginDrag: beginListDismissalDrag,
    onScrollEndDrag: endListDismissalDrag,
    updateDismissalProgress,
  } = usePlayerListDismissal(isPresentedOverlay);
  const listBottomClearance = insets.bottom + 76;

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
    if (recentlyPlayed.length > 0 || historyPreview.length > 0) {
      items.push({
        icon: 'history',
        id: 'listening',
        kind: 'section-header',
        label: 'Earlier Listening',
      });
    }
    if (recentlyPlayed.length > 0) items.push({ kind: 'view-all-history' });
    items.push(
      ...historyPreview.map((entry, index) => ({
        entry,
        isFirst: recentlyPlayed.length === 0 && index === 0,
        isLast: index === historyPreview.length - 1,
        kind: 'history' as const,
      }))
    );
    if (earlierQueueEntries.length > 0) {
      if (recentlyPlayed.length > 0 || historyPreview.length > 0) {
        items.push({ id: 'before-queue', kind: 'sticky-reset' });
      }
      items.push({
        icon: 'queue-music',
        id: 'queue',
        kind: 'section-header',
        label: 'Earlier in Queue',
      });
    }
    items.push(...earlierQueueEntries.map((entry) => ({ entry, kind: 'earlier-queue' as const })));
    items.push(
      { id: 'before-now-playing', kind: 'sticky-reset' },
      { kind: 'now-playing' },
      {
        count: upNextEntries.length,
        icon: 'queue-music',
        id: 'up-next',
        kind: 'section-header',
        label: 'Up Next',
      }
    );
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
  const initialRenderCount = Math.min(timelineItems.length, pivotIndex < 40 ? pivotIndex + 2 : 20);
  const prePivotSignature = useMemo(
    () => timelineItems.slice(0, pivotIndex).map(timelineItemKey).join('|'),
    [pivotIndex, timelineItems]
  );
  const stickyHeaderIndices = useMemo(
    () =>
      timelineItems.flatMap((item, index) =>
        item.kind === 'section-header' || item.kind === 'sticky-reset' ? [index] : []
      ),
    [timelineItems]
  );

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
      const generation = reconciliationGeneration.current;
      const measurePivot = () => {
        pivot.measureInWindow((_pivotX, pivotY) => {
          container.measureInWindow((_containerX, containerY) => {
            anchorMeasurementPending.current = false;
            if (
              !reveal &&
              (generation !== reconciliationGeneration.current ||
                scrollPhaseRef.current !== 'idle' ||
                isQueueDraggingRef.current ||
                isPivotOffscreenRef.current)
            ) {
              pendingPivotReconciliation.current = true;
              return;
            }

            const previousPivotOffset = pivotOffsetRef.current;
            const currentOffset = effectiveScrollOffset.value;
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
              hasAnchored.current = true;
              requestAnimationFrame(() => {
                setIsAnchorReady(true);
                focusNowPlaying();
              });
            }
          });
        });
      };

      requestAnimationFrame(measurePivot);
    },
    [anchorReady, applyScrollOffset, effectiveScrollOffset, focusNowPlaying, pivotOffset]
  );

  const schedulePivotReconciliation = useCallback(() => {
    if (!hasAnchored.current) return;

    if (
      scrollPhaseRef.current !== 'idle' ||
      isQueueDraggingRef.current ||
      isPivotOffscreenRef.current
    ) {
      pendingPivotReconciliation.current = true;
      return;
    }

    pendingPivotReconciliation.current = false;
    requestAnimationFrame(() => {
      if (
        scrollPhaseRef.current !== 'idle' ||
        isQueueDraggingRef.current ||
        isPivotOffscreenRef.current
      ) {
        pendingPivotReconciliation.current = true;
        return;
      }

      reconcilePivot(false);
    });
  }, [reconcilePivot]);

  const settleScrollWithoutMomentum = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollPhaseRef.current !== 'awaiting-momentum') return;
      scrollPhaseRef.current = 'idle';
      if (pendingPivotReconciliation.current) schedulePivotReconciliation();
    });
  }, [schedulePivotReconciliation]);

  useEffect(() => {
    schedulePivotReconciliation();
  }, [currentTrack?.identifier, prePivotSignature, schedulePivotReconciliation]);

  const handleInitialScrollFailure = useCallback(
    ({ averageItemLength, index }: { averageItemLength: number; index: number }) => {
      if (hasAnchored.current) return;
      applyScrollOffset(Math.max(0, averageItemLength * index));

      if (anchorRetryCount.current >= 3) {
        setIsAnchorReady(true);
        return;
      }
      anchorRetryCount.current += 1;
      setTimeout(() => {
        if (hasAnchored.current) return;
        listRef.current?.scrollToIndex({ animated: false, index, viewPosition: 0 });
      }, 50);
    },
    [applyScrollOffset]
  );

  useEffect(() => {
    if (listViewportHeight <= 0 || hasAnchored.current || anchorAttemptStarted.current) {
      return;
    }

    anchorAttemptStarted.current = true;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ animated: false, index: pivotIndex, viewPosition: 0 });
    });
  }, [listViewportHeight, pivotIndex]);

  const handleListContainerLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setListViewportHeight((currentHeight) =>
      Math.abs(currentHeight - nextHeight) >= 1 ? nextHeight : currentHeight
    );
  }, []);

  const handleAnimatedValuesReady = useCallback(
    ({ scrollOffset: nextScrollOffset }: { scrollOffset: SharedValue<number> }) => {
      setNativeScrollOffset((current) =>
        current === nextScrollOffset ? current : nextScrollOffset
      );
    },
    []
  );

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<TimelineItem>[] }) => {
      if (!hasAnchored.current) return;
      const nextIsPivotOffscreen = !viewableItems.some(
        ({ isViewable, item }) => isViewable && item.kind === 'now-playing'
      );
      isPivotOffscreenRef.current = nextIsPivotOffscreen;
      setIsPivotOffscreen(nextIsPivotOffscreen);
      if (!nextIsPivotOffscreen && pendingPivotReconciliation.current) {
        schedulePivotReconciliation();
      }
    },
    [schedulePivotReconciliation]
  );

  const pinnedNowPlayingStyle = useAnimatedStyle(() => {
    if (!anchorReady.value) {
      return { transform: [{ translateY: 0 }], zIndex: 0 };
    }
    const relativeOffset = Math.max(effectiveScrollOffset.value - pivotOffset.value, 0);
    return {
      transform: [{ translateY: relativeOffset }],
      zIndex: 0,
    };
  });

  const triggerHaptics = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const setQueueDragging = useCallback((dragging: boolean) => {
    isQueueDraggingRef.current = dragging;
    setIsDragging(dragging);
  }, []);

  const finishQueueDrag = useCallback(() => {
    setQueueDragging(false);
    schedulePivotReconciliation();
  }, [schedulePivotReconciliation, setQueueDragging]);

  const handleDragEnd = useCallback(
    ({ from, to }: DragEndParams<TimelineItem>) => {
      finishQueueDrag();
      triggerHaptics();
      const fromItem = timelineItems[from];
      if (fromItem?.kind !== 'up-next') return;

      const firstUpNextIndex = timelineItems.findIndex((item) => item.kind === 'up-next');
      const lastUpNextIndex = timelineItems.findLastIndex((item) => item.kind === 'up-next');
      const targetIndex = Math.max(firstUpNextIndex, Math.min(to, lastUpNextIndex));
      const targetItem = timelineItems[targetIndex];
      if (targetItem?.kind === 'up-next') {
        player.queue.moveQueueTrack(fromItem.entry.queueIndex, targetItem.entry.queueIndex);
      }
    },
    [finishQueueDrag, player, timelineItems, triggerHaptics]
  );

  const returnToNowPlaying = useCallback(() => {
    applyScrollOffset(pivotOffsetRef.current);
    AccessibilityInfo.announceForAccessibility('Returned to Now Playing');
    focusNowPlaying();
  }, [applyScrollOffset, focusNowPlaying]);

  const renderItem = useCallback(
    ({ drag, item }: RenderItemParams<TimelineItem>) => {
      switch (item.kind) {
        case 'view-all-history':
          return (
            <ViewAllHistoryButton isLast={historyPreview.length === 0} onPress={onOpenHistory} />
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
        case 'section-header':
          return (
            <PlayerTimelineSectionHeader count={item.count} icon={item.icon} label={item.label} />
          );
        case 'sticky-reset':
          return (
            <View
              accessibilityElementsHidden
              className="h-px bg-transparent"
              importantForAccessibility="no-hide-descendants"
            />
          );
        case 'earlier-queue':
          return <EarlierQueueItem entry={item.entry} />;
        case 'now-playing':
          return (
            <View
              collapsable={false}
              ref={nowPlayingRef}
              onLayout={() => {
                if (hasAnchored.current) {
                  schedulePivotReconciliation();
                } else {
                  reconcilePivot(true);
                }
              }}
            >
              <Animated.View style={pinnedNowPlayingStyle}>
                <PlayerNowPlaying
                  headingRef={nowPlayingHeadingRef}
                  onBeforeNavigate={onBeforeNavigate}
                  visualizerActive={visualizerActive && !isPivotOffscreen}
                />
              </Animated.View>
            </View>
          );
        case 'up-next':
          return (
            <UpNextQueueItem
              drag={drag}
              entry={item.entry}
              onReorderStart={() => setQueueDragging(true)}
            />
          );
        case 'empty-up-next':
          return (
            <PlayerPanelRow isFirst isLast>
              <View className="p-6">
                <RelistenText className="text-center text-gray-300" selectable={false}>
                  Nothing else is queued
                </RelistenText>
              </View>
            </PlayerPanelRow>
          );
      }
    },
    [
      isPivotOffscreen,
      onBeforeNavigate,
      onOpenHistory,
      onViewHistoryShow,
      pinnedNowPlayingStyle,
      reconcilePivot,
      schedulePivotReconciliation,
      setQueueDragging,
      visualizerActive,
    ]
  );

  if (!currentTrack) return <View className="flex-1" />;

  return (
    <View
      className="flex-1"
      collapsable={false}
      onLayout={handleListContainerLayout}
      ref={listContainerRef}
    >
      <DraggableFlatList
        // The library's ref type names the RNGH component instead of the native FlatList instance.
        ref={listRef as never}
        alwaysBounceVertical
        contentInsetAdjustmentBehavior="never"
        containerStyle={{ height: listViewportHeight }}
        data={timelineItems}
        onAnimValInit={handleAnimatedValuesReady}
        initialNumToRender={initialRenderCount}
        keyExtractor={timelineItemKey}
        ListFooterComponent={
          <View className="bg-relisten-blue-900" style={{ height: listBottomClearance }}>
            <View
              className="absolute inset-x-0 top-0 bg-relisten-blue-900"
              pointerEvents="none"
              style={{ height }}
            />
          </View>
        }
        onDragBegin={() => {
          setQueueDragging(true);
          triggerHaptics();
        }}
        onDragEnd={handleDragEnd}
        onScrollToIndexFailed={handleInitialScrollFailure}
        onScrollBeginDrag={(event) => {
          reconciliationGeneration.current += 1;
          scrollPhaseRef.current = 'dragging';
          beginListDismissalDrag(event);
        }}
        onScrollEndDrag={(event) => {
          scrollPhaseRef.current = 'awaiting-momentum';
          endListDismissalDrag(event);
          settleScrollWithoutMomentum();
        }}
        onMomentumScrollBegin={() => {
          scrollPhaseRef.current = 'momentum';
        }}
        onMomentumScrollEnd={() => {
          scrollPhaseRef.current = 'idle';
          if (pendingPivotReconciliation.current) schedulePivotReconciliation();
        }}
        onViewableItemsChanged={handleViewableItemsChanged}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={stickyHeaderIndices}
        style={{ height: listViewportHeight, opacity: isAnchorReady ? 1 : 0 }}
        viewabilityConfig={PIVOT_VIEWABILITY_CONFIG}
      />
      {nativeScrollOffset && (
        <PlayerTimelineScrollObserver
          onScroll={updateDismissalProgress}
          source={nativeScrollOffset}
        />
      )}
      <ReturnToNowPlayingButton
        bottomInset={insets.bottom}
        onPress={returnToNowPlaying}
        visible={isPivotOffscreen && !isDragging}
      />
    </View>
  );
}
