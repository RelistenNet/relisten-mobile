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

type PlayerQueueSheetProps = {
  onOpenHistory: () => void;
  onQueueHeaderActiveChange: (active: boolean) => void;
  onViewHistoryShow: (entry: PlaybackHistoryEntry) => void;
  usesTransparentHeader: boolean;
};

export function PlayerQueueSheet({
  onOpenHistory,
  onQueueHeaderActiveChange,
  onViewHistoryShow,
  usesTransparentHeader,
}: PlayerQueueSheetProps) {
  'use no memo';

  const player = useRelistenPlayer();
  const { height } = useWindowDimensions();
  const orderedQueueTracks = useRelistenPlayerQueueOrderedTracks();
  const currentTrack = useRelistenPlayerCurrentTrack();
  const listRef = useRef<FlatList<QueueTimelineEntry>>(null);
  const nowPlayingHeadingRef = useRef<View>(null);
  const hasAnchored = useRef(false);
  const pastContentHeightRef = useRef(0);
  const [isAnchored, setIsAnchored] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPivotOffscreen, setIsPivotOffscreen] = useState(false);
  const scrollOffset = useSharedValue(0);
  const pastContentHeight = useSharedValue(0);
  const nowPlayingHeight = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
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

  const applyScrollOffset = useCallback(
    (offset: number) => {
      listRef.current?.scrollToOffset({ animated: false, offset });
      scrollOffset.value = offset;
    },
    [scrollOffset]
  );

  const focusNowPlaying = useCallback(() => {
    requestAnimationFrame(() => {
      const handle = findNodeHandle(nowPlayingHeadingRef.current);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    });
  }, []);

  const revealAnchoredList = useCallback(() => {
    requestAnimationFrame(() => {
      setIsAnchored(true);
      focusNowPlaying();
    });
  }, [focusNowPlaying]);

  const handlePastContentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = event.nativeEvent.layout.height;
      const previousHeight = pastContentHeightRef.current;
      if (hasAnchored.current && nextHeight === previousHeight) {
        if (!isAnchored) setIsAnchored(true);
        return;
      }

      pastContentHeightRef.current = nextHeight;
      pastContentHeight.value = nextHeight;

      if (!hasAnchored.current) {
        hasAnchored.current = true;
        applyScrollOffset(nextHeight);
        revealAnchoredList();
        return;
      }

      const currentOffset = scrollOffset.value;
      if (currentOffset >= previousHeight - 1) {
        applyScrollOffset(currentOffset + nextHeight - previousHeight);
      }
    },
    [applyScrollOffset, isAnchored, pastContentHeight, revealAnchoredList, scrollOffset]
  );

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollOffset.value = event.contentOffset.y;
    },
  });

  useAnimatedReaction(
    () => {
      if (nowPlayingHeight.value <= 0 || viewportHeight.value <= 0) {
        return false;
      }

      const relativeOffset = scrollOffset.value - pastContentHeight.value;
      return (
        relativeOffset >= nowPlayingHeight.value || relativeOffset <= -viewportHeight.value + 44
      );
    },
    (offscreen, previous) => {
      if (offscreen !== previous) {
        runOnJS(setIsPivotOffscreen)(offscreen);
      }
    }
  );

  useEffect(() => {
    onQueueHeaderActiveChange(isPivotOffscreen);
  }, [isPivotOffscreen, onQueueHeaderActiveChange]);

  const nowPlayingStyle = useAnimatedStyle(() => {
    const relativeOffset = Math.max(scrollOffset.value - pastContentHeight.value, 0);
    return {
      transform: [{ translateY: Math.min(relativeOffset * 0.78, height * 0.16) }],
      zIndex: 0,
    };
  });

  const triggerHaptics = useCallback(() => {
    'worklet';
    runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleDragStart = useCallback(() => {
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
    const fromEntry = upNextEntries[from];
    const toEntry = upNextEntries[to];
    if (fromEntry && toEntry) {
      player.queue.moveQueueTrack(fromEntry.queueIndex, toEntry.queueIndex);
    }
  };

  const returnToNowPlaying = useCallback(() => {
    applyScrollOffset(pastContentHeightRef.current);
    AccessibilityInfo.announceForAccessibility('Returned to Now Playing');
    focusNowPlaying();
  }, [applyScrollOffset, focusNowPlaying]);

  return (
    <View style={{ flex: 1 }}>
      <ReorderableList
        ref={listRef}
        alwaysBounceVertical
        contentInsetAdjustmentBehavior={usesTransparentHeader ? 'automatic' : 'never'}
        data={upNextEntries}
        keyExtractor={(entry) => entry.queueTrack.identifier}
        ListHeaderComponent={
          <View style={{ overflow: 'visible' }}>
            <View onLayout={handlePastContentLayout}>
              {recentlyPlayed.length > 0 && (
                <PlayerTimelineBoundary
                  accessibilityHint="Opens your complete listening history."
                  icon="history"
                  label="View All Listening History"
                  onPress={onOpenHistory}
                />
              )}
              {historyPreview.map((entry, index) => (
                <PlayerHistoryItem
                  key={entry.uuid}
                  entry={entry}
                  isFirst={index === 0}
                  isLast={index === historyPreview.length - 1}
                  onViewShow={() => onViewHistoryShow(entry)}
                />
              ))}
              {historyPreview.length > 0 && (
                <PlayerTimelineBoundary icon="history" label="Earlier Listening" />
              )}
              {earlierQueueEntries.map((entry) => (
                <EarlierQueueItem key={entry.queueTrack.identifier} entry={entry} />
              ))}
              {earlierQueueEntries.length > 0 && (
                <PlayerTimelineBoundary icon="queue-music" label="Earlier in Queue" />
              )}
            </View>
            <Animated.View
              onLayout={(event) => {
                nowPlayingHeight.value = event.nativeEvent.layout.height;
              }}
              style={nowPlayingStyle}
            >
              <PlayerNowPlaying headingRef={nowPlayingHeadingRef} />
            </Animated.View>
            <UpNextHeader count={upNextEntries.length} />
          </View>
        }
        ListEmptyComponent={
          <PlayerPanelRow isFirst isLast>
            <View style={{ padding: 24 }}>
              <RelistenText className="text-center text-gray-300" selectable={false}>
                Nothing else is queued
              </RelistenText>
            </View>
          </PlayerPanelRow>
        }
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
        onDragStart={handleDragStart}
        onIndexChange={triggerHaptics}
        onLayout={(event) => {
          viewportHeight.value = event.nativeEvent.layout.height;
        }}
        onReorder={onReorder}
        onScroll={handleScroll}
        onScrollBeginDrag={() => setIsDragging(false)}
        renderItem={({ item }) => (
          <UpNextQueueItem entry={item} onReorderStart={() => setIsDragging(true)} />
        )}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, opacity: isAnchored ? 1 : 0 }}
      />
      <ReturnToNowPlayingButton
        onPress={returnToNowPlaying}
        visible={isPivotOffscreen && !isDragging}
      />
    </View>
  );
}
