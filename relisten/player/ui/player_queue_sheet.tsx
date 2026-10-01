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
import {
  PlayerTimelineStickyHeader,
  PlayerTimelineStickyHeaderProvider,
} from '@/relisten/player/ui/player_timeline_sticky_header';
import { ReturnToNowPlayingButton } from '@/relisten/player/ui/return_to_now_playing_button';
import { isQueueReorderCurrent } from '@/relisten/player/ui/player_queue_reorder';
import { PlayerQueueTransport } from '@/relisten/player/ui/player_queue_transport';
import {
  playerTimelineFooterHeight,
  playerTimelineSnapOffsets,
  reconciledPlayerTimelineOffset,
  type PlayerTimelineLayout,
} from '@/relisten/player/ui/player_timeline_layout';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DraggableFlatList, {
  type DragEndParams,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useReducedMotion,
  useSharedValue,
  useDerivedValue,
} from 'react-native-reanimated';

const HISTORY_PREVIEW_LIMIT = 5;

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

function PlayerTimelinePivotObserver({
  anchorReady,
  nowPlayingHeight,
  compactHeight,
  onVisibilityChange,
  onNowPlayingRest,
  pivotOffset,
  scrollOffset,
  viewportHeight,
}: {
  anchorReady: SharedValue<boolean>;
  nowPlayingHeight: SharedValue<number>;
  compactHeight: number;
  onVisibilityChange: (offscreen: boolean, queueVisible: boolean) => void;
  onNowPlayingRest: () => void;
  pivotOffset: SharedValue<number>;
  scrollOffset: SharedValue<number>;
  viewportHeight: number;
}) {
  useAnimatedReaction(
    () => {
      if (!anchorReady.value || nowPlayingHeight.value <= 0 || viewportHeight <= 0) {
        return 0;
      }

      const relativeOffset = scrollOffset.value - pivotOffset.value;
      if (relativeOffset >= (nowPlayingHeight.value - compactHeight) * 0.85 - 1) return 1;
      return relativeOffset <= -viewportHeight + 1 ? -1 : 0;
    },
    (visibility, previousVisibility) => {
      if (visibility !== previousVisibility)
        runOnJS(onVisibilityChange)(visibility !== 0, visibility === 1);
    },
    [
      anchorReady,
      compactHeight,
      nowPlayingHeight,
      onVisibilityChange,
      pivotOffset,
      scrollOffset,
      viewportHeight,
    ]
  );

  useAnimatedReaction(
    () => anchorReady.value && Math.abs(scrollOffset.value - pivotOffset.value) <= 1,
    (atRest, wasAtRest) => {
      if (atRest && !wasAtRest) runOnJS(onNowPlayingRest)();
    },
    [anchorReady, onNowPlayingRest, pivotOffset, scrollOffset]
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
  backdropProgress: SharedValue<number>;
  queueProgress: SharedValue<number>;
  isPresentedOverlay: boolean;
  onBeforeNavigate: (navigate: () => void) => void;
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
  backdropProgress,
  queueProgress,
  isPresentedOverlay,
  onBeforeNavigate,
  onOpenHistory,
  onViewHistoryShow,
  visualizerActive,
}: PlayerQueueSheetProps) {
  'use no memo';

  const player = useRelistenPlayer();
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const orderedQueueTracks = useRelistenPlayerQueueOrderedTracks();
  const currentTrack = useRelistenPlayerCurrentTrack();
  const listRef = useRef<FlatList<TimelineItem>>(null);
  const nowPlayingHeadingRef = useRef<View>(null);
  const hasAnchored = useRef(false);
  const anchorRevealScheduled = useRef(false);
  const anchorAttemptStarted = useRef(false);
  const anchorRetryCount = useRef(0);
  const pendingPivotReconciliation = useRef(false);
  const reconciliationGeneration = useRef(0);
  const measuredPivotLayoutRef = useRef<PlayerTimelineLayout | undefined>(undefined);
  const committedPivotLayoutRef = useRef<PlayerTimelineLayout | undefined>(undefined);
  const [pivotLayout, setPivotLayout] = useState<PlayerTimelineLayout>();
  const [queueItemHeights, setQueueItemHeights] = useState<Record<string, number>>({});
  const measureQueueItem = useCallback((key: string, height: number) => {
    setQueueItemHeights((current) =>
      current[key] === height ? current : { ...current, [key]: height }
    );
  }, []);
  const [transportHeight, setTransportHeight] = useState(0);
  const committedTransportHeightRef = useRef(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const isScrubbingRef = useRef(false);
  const pivotOffsetRef = useRef(0);
  const isPivotOffscreenRef = useRef(false);
  const isQueueDraggingRef = useRef(false);
  const reorderKeysRef = useRef<readonly string[] | null>(null);
  const pendingReturnFocusRef = useRef(false);
  const focusGenerationRef = useRef(0);
  const [returnArrival, setReturnArrival] = useState(0);
  const [isAnchorReady, setIsAnchorReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPivotOffscreen, setIsPivotOffscreen] = useState(false);
  const [isQueueVisible, setIsQueueVisible] = useState(false);
  const [listViewportHeight, setListViewportHeight] = useState(0);
  const [nativeScrollOffset, setNativeScrollOffset] = useState<SharedValue<number> | null>(null);
  const scrollOffset = useSharedValue(0);
  const effectiveScrollOffset = nativeScrollOffset ?? scrollOffset;
  const pivotOffset = useSharedValue(0);
  const nowPlayingHeight = useSharedValue(0);
  const anchorReady = useSharedValue(false);
  const expandedPlayerStyle = useAnimatedStyle(() => ({
    // Preserve its measured height, but finish fading before compact appears.
    // Otherwise the lower utility buttons peek out below the compact header.
    opacity: interpolate(queueProgress.value, [0.2, 0.5], [1, 0], Extrapolation.CLAMP),
  }));
  useDerivedValue(() => {
    if (!anchorReady.value) {
      queueProgress.value = 0;
      backdropProgress.value = 0;
      return;
    }
    const distance = Math.max(1, nowPlayingHeight.value - transportHeight);
    queueProgress.value = Math.max(
      0,
      Math.min(1, (effectiveScrollOffset.value - pivotOffset.value) / distance)
    );
    // History headers and overscroll share one solid backdrop with the handle.
    const historyDistance = Math.max(1, Math.min(pivotOffset.value, listViewportHeight * 0.4));
    const historyProgress = Math.max(
      0,
      (pivotOffset.value - effectiveScrollOffset.value) / historyDistance
    );
    backdropProgress.value = Math.min(1, Math.max(queueProgress.value / 0.55, historyProgress));
  });
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
  } = usePlayerListDismissal(isPresentedOverlay && !isDragging && !isScrubbing);
  const snapOffsets = playerTimelineSnapOffsets(
    isAnchorReady ? pivotLayout : undefined,
    listViewportHeight,
    isDragging || isScrubbing,
    transportHeight
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

  // Measure the actual queue items, independent of the footer. Subtracting a
  // changing footer from an asynchronous total-content callback can oscillate
  // and leave the compact endpoint short of its intended offset.
  const queueContentHeight = timelineItems.reduce(
    (sum, item) =>
      item.kind === 'up-next' ||
      item.kind === 'empty-up-next' ||
      (item.kind === 'section-header' && item.id === 'up-next')
        ? sum + (queueItemHeights[timelineItemKey(item)] ?? 0)
        : sum,
    0
  );
  const listBottomClearance = playerTimelineFooterHeight(
    Math.max(0, listViewportHeight - transportHeight),
    queueContentHeight,
    insets.bottom + 16
  );
  const timelineKeys = useMemo(() => timelineItems.map(timelineItemKey), [timelineItems]);

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
        item.kind === 'section-header' ||
        item.kind === 'sticky-reset' ||
        item.kind === 'now-playing'
          ? [index]
          : []
      ),
    [timelineItems]
  );

  const applyScrollOffset = useCallback(
    (offset: number) => {
      listRef.current?.scrollToOffset({ animated: false, offset });
      scrollOffset.set(offset);
    },
    [scrollOffset]
  );

  const focusNowPlaying = useCallback(() => {
    const generation = focusGenerationRef.current;
    void AccessibilityInfo.isScreenReaderEnabled().then((isScreenReaderEnabled) => {
      if (!isScreenReaderEnabled || generation !== focusGenerationRef.current) return;

      requestAnimationFrame(() => {
        if (generation !== focusGenerationRef.current) return;
        const handle = findNodeHandle(nowPlayingHeadingRef.current);
        if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
      });
    });
  }, []);

  const reconcilePivot = useCallback(
    (reveal: boolean) => {
      const nextLayout = measuredPivotLayoutRef.current;
      if (!nextLayout) return;
      if (
        !reveal &&
        (scrollPhaseRef.current !== 'idle' || isQueueDraggingRef.current || isScrubbingRef.current)
      ) {
        pendingPivotReconciliation.current = true;
        return;
      }

      const previousLayout = committedPivotLayoutRef.current;
      const previousTransportHeight = committedTransportHeightRef.current;
      committedTransportHeightRef.current = transportHeight;
      const currentOffset = effectiveScrollOffset.value;
      committedPivotLayoutRef.current = nextLayout;
      pivotOffsetRef.current = nextLayout.y;
      pivotOffset.set(nextLayout.y);
      nowPlayingHeight.set(nextLayout.height);
      setPivotLayout(nextLayout);

      const nextOffset =
        reveal || !previousLayout
          ? nextLayout.y
          : reconciledPlayerTimelineOffset(
              currentOffset,
              previousLayout,
              nextLayout,
              previousTransportHeight,
              transportHeight
            );
      if (reveal || Math.abs(nextOffset - currentOffset) >= 1) applyScrollOffset(nextOffset);

      anchorReady.set(true);
      if (reveal) {
        hasAnchored.current = true;
        requestAnimationFrame(() => {
          setIsAnchorReady(true);
          focusNowPlaying();
        });
      }
    },
    [
      anchorReady,
      applyScrollOffset,
      effectiveScrollOffset,
      focusNowPlaying,
      nowPlayingHeight,
      pivotOffset,
      transportHeight,
    ]
  );

  const schedulePivotReconciliation = useCallback(() => {
    if (!hasAnchored.current) return;

    if (scrollPhaseRef.current !== 'idle' || isQueueDraggingRef.current || isScrubbingRef.current) {
      pendingPivotReconciliation.current = true;
      return;
    }

    pendingPivotReconciliation.current = false;
    const generation = reconciliationGeneration.current;
    requestAnimationFrame(() => {
      if (
        generation !== reconciliationGeneration.current ||
        scrollPhaseRef.current !== 'idle' ||
        isQueueDraggingRef.current ||
        isScrubbingRef.current
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
      if (hasAnchored.current || anchorRevealScheduled.current) return;
      applyScrollOffset(Math.max(0, averageItemLength * index));

      if (anchorRetryCount.current >= 3) {
        setIsAnchorReady(true);
        return;
      }
      anchorRetryCount.current += 1;
      setTimeout(() => {
        if (hasAnchored.current || anchorRevealScheduled.current) return;
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
      if (anchorRevealScheduled.current) return;
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

  const handlePivotVisibilityChange = useCallback(
    (nextIsPivotOffscreen: boolean, queueVisible: boolean) => {
      setIsQueueVisible(queueVisible);
      if (isPivotOffscreenRef.current === nextIsPivotOffscreen) return;
      isPivotOffscreenRef.current = nextIsPivotOffscreen;
      setIsPivotOffscreen(nextIsPivotOffscreen);
      if (!nextIsPivotOffscreen && pendingPivotReconciliation.current) {
        schedulePivotReconciliation();
      }
    },
    [schedulePivotReconciliation]
  );

  const handleNowPlayingStickyLayout = useCallback(
    ({ height: measuredHeight, y }: { height: number; y: number }) => {
      measuredPivotLayoutRef.current = { y, height: measuredHeight };
      if (hasAnchored.current) {
        schedulePivotReconciliation();
      } else if (!anchorRevealScheduled.current) {
        anchorRevealScheduled.current = true;
        // The sticky wrapper and the FlatList ref settle in consecutive native commits.
        // Scrolling in the wrapper's layout transaction is ignored on iOS.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!hasAnchored.current) reconcilePivot(true);
            anchorRevealScheduled.current = false;
          });
        });
      }
    },
    [reconcilePivot, schedulePivotReconciliation]
  );

  const triggerHaptics = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const setQueueDragging = useCallback((dragging: boolean) => {
    reconciliationGeneration.current += 1;
    isQueueDraggingRef.current = dragging;
    setIsDragging(dragging);
  }, []);

  const handleScrubbingChange = useCallback(
    (scrubbing: boolean) => {
      isScrubbingRef.current = scrubbing;
      setIsScrubbing(scrubbing);
      if (scrubbing) reconciliationGeneration.current += 1;
      else if (pendingPivotReconciliation.current) schedulePivotReconciliation();
    },
    [schedulePivotReconciliation]
  );

  const finishQueueDrag = useCallback(() => {
    setQueueDragging(false);
    schedulePivotReconciliation();
  }, [schedulePivotReconciliation, setQueueDragging]);

  // The list cancels its native drag without onDragEnd when its keys change.
  // Mirror that cancellation so playback advance cannot leave transport locked.
  useEffect(() => {
    if (
      isQueueDraggingRef.current &&
      !isQueueReorderCurrent(reorderKeysRef.current, timelineKeys)
    ) {
      reorderKeysRef.current = null;
      finishQueueDrag();
    }
  }, [finishQueueDrag, timelineKeys]);

  const handleDragEnd = useCallback(
    ({ from, to }: DragEndParams<TimelineItem>) => {
      if (!isQueueReorderCurrent(reorderKeysRef.current, timelineKeys)) return;
      reorderKeysRef.current = null;
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
    [finishQueueDrag, player, timelineItems, timelineKeys, triggerHaptics]
  );

  const handleNowPlayingRest = useCallback(() => {
    if (pendingReturnFocusRef.current) setReturnArrival((arrival) => arrival + 1);
  }, []);

  // Native arrival and visibility callbacks can land in the same frame. Focus
  // only after React has committed the expanded heading's accessibility state.
  useEffect(() => {
    if (returnArrival === 0 || isPivotOffscreen || !pendingReturnFocusRef.current) return;
    pendingReturnFocusRef.current = false;
    AccessibilityInfo.announceForAccessibility('Returned to Now Playing');
    focusNowPlaying();
  }, [focusNowPlaying, isPivotOffscreen, returnArrival]);

  const returnToNowPlaying = useCallback(() => {
    if (isQueueDraggingRef.current || isScrubbingRef.current) return;
    focusGenerationRef.current += 1;
    setReturnArrival(0);
    pendingReturnFocusRef.current = true;
    listRef.current?.scrollToOffset({ animated: !reduceMotion, offset: pivotOffsetRef.current });
    if (Math.abs(effectiveScrollOffset.value - pivotOffsetRef.current) <= 1) handleNowPlayingRest();
  }, [effectiveScrollOffset, handleNowPlayingRest, reduceMotion]);

  const openQueue = useCallback(() => {
    if (isQueueDraggingRef.current || isScrubbingRef.current) return;
    const layout = committedPivotLayoutRef.current;
    if (layout)
      listRef.current?.scrollToOffset({
        animated: !reduceMotion,
        offset: layout.y + Math.max(0, layout.height - transportHeight),
      });
  }, [reduceMotion, transportHeight]);

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
            <View
              onLayout={
                item.id === 'up-next'
                  ? (event) =>
                      measureQueueItem(timelineItemKey(item), event.nativeEvent.layout.height)
                  : undefined
              }
            >
              <PlayerTimelineSectionHeader
                count={item.count}
                icon={item.icon}
                label={item.label}
                onPress={item.id === 'up-next' ? openQueue : undefined}
              />
            </View>
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
            <Animated.View
              style={expandedPlayerStyle}
              accessibilityElementsHidden={isPivotOffscreen}
              collapsable={false}
              importantForAccessibility={isPivotOffscreen ? 'no-hide-descendants' : 'auto'}
              pointerEvents={isPivotOffscreen ? 'none' : 'auto'}
            >
              <PlayerNowPlaying
                headingRef={nowPlayingHeadingRef}
                onBeforeNavigate={onBeforeNavigate}
                onScrubbingChange={handleScrubbingChange}
                visualizerActive={visualizerActive && !isPivotOffscreen}
              />
            </Animated.View>
          );
        case 'up-next':
          return (
            <View
              onLayout={(event) =>
                measureQueueItem(timelineItemKey(item), event.nativeEvent.layout.height)
              }
            >
              <UpNextQueueItem drag={drag} entry={item.entry} />
            </View>
          );
        case 'empty-up-next':
          return (
            <View
              onLayout={(event) =>
                measureQueueItem(timelineItemKey(item), event.nativeEvent.layout.height)
              }
            >
              <PlayerPanelRow isFirst isLast>
                <View className="p-6">
                  <RelistenText className="text-center text-gray-300" selectable={false}>
                    Nothing else is queued
                  </RelistenText>
                </View>
              </PlayerPanelRow>
            </View>
          );
      }
    },
    [
      isPivotOffscreen,
      expandedPlayerStyle,
      measureQueueItem,
      handleScrubbingChange,
      openQueue,
      onBeforeNavigate,
      onOpenHistory,
      onViewHistoryShow,
      setQueueDragging,
      visualizerActive,
    ]
  );

  if (!currentTrack) return <View className="flex-1" />;

  return (
    <View className="flex-1" collapsable={false} onLayout={handleListContainerLayout}>
      <PlayerTimelineStickyHeaderProvider
        onNowPlayingLayout={handleNowPlayingStickyLayout}
        queueHeaderInset={transportHeight}
      >
        <DraggableFlatList
          // The library's ref type names the RNGH component instead of the native FlatList instance.
          ref={listRef as never}
          alwaysBounceVertical
          contentInsetAdjustmentBehavior="never"
          containerStyle={{ height: listViewportHeight }}
          data={timelineItems}
          decelerationRate="fast"
          snapToOffsets={snapOffsets}
          snapToStart={false}
          snapToEnd={false}
          scrollEnabled={!isScrubbing}
          renderPlaceholder={() => <View className="flex-1 bg-relisten-blue-900" />}
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
            reorderKeysRef.current = timelineKeys;
            pendingReturnFocusRef.current = false;
            focusGenerationRef.current += 1;
            setQueueDragging(true);
            triggerHaptics();
          }}
          onDragEnd={handleDragEnd}
          onScrollToIndexFailed={handleInitialScrollFailure}
          onScrollBeginDrag={(event) => {
            pendingReturnFocusRef.current = false;
            focusGenerationRef.current += 1;
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
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={stickyHeaderIndices}
          StickyHeaderComponent={PlayerTimelineStickyHeader}
          style={{ height: listViewportHeight, opacity: isAnchorReady ? 1 : 0 }}
        />
      </PlayerTimelineStickyHeaderProvider>
      {nativeScrollOffset && (
        <>
          <PlayerTimelineScrollObserver
            onScroll={updateDismissalProgress}
            source={nativeScrollOffset}
          />
          <PlayerTimelinePivotObserver
            anchorReady={anchorReady}
            nowPlayingHeight={nowPlayingHeight}
            compactHeight={transportHeight}
            onVisibilityChange={handlePivotVisibilityChange}
            onNowPlayingRest={handleNowPlayingRest}
            pivotOffset={pivotOffset}
            scrollOffset={nativeScrollOffset}
            viewportHeight={listViewportHeight}
          />
        </>
      )}
      <PlayerQueueTransport
        interactive={isQueueVisible && !isDragging}
        onLayout={(event) => setTransportHeight(event.nativeEvent.layout.height)}
        onReturn={returnToNowPlaying}
        onScrubbingChange={handleScrubbingChange}
        progress={queueProgress}
      />
      <ReturnToNowPlayingButton
        bottomInset={insets.bottom}
        onPress={returnToNowPlaying}
        visible={isPivotOffscreen && !isQueueVisible && !isDragging}
      />
    </View>
  );
}
