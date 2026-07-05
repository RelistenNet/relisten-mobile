import { RelistenText } from '@/relisten/components/relisten_text';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import {
  useRelistenPlayerCurrentTrack,
  useRelistenPlayerQueueOrderedTracks,
} from '@/relisten/player/relisten_player_queue_hooks';
import { PlayerHistoryItem } from '@/relisten/player/ui/player_history_item';
import { PlayerNowPlaying } from '@/relisten/player/ui/player_now_playing';
import { PlayerPanelHeader, type PlayerPanelMode } from '@/relisten/player/ui/player_panel_header';
import { PlayerPanelRow } from '@/relisten/player/ui/player_panel_row';
import {
  PLAYER_PANEL_BACKGROUND,
  PLAYER_PANEL_BORDER_COLOR,
} from '@/relisten/player/ui/player_panel_theme';
import {
  playerPresentationProgress,
  usePlayerPresentation,
} from '@/relisten/player/ui/player_presentation';
import { type QueueTimelineEntry, UpNextQueueItem } from '@/relisten/player/ui/player_queue_row';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { useQuery } from '@/relisten/realm/schema';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
  View,
} from 'react-native';
import ReorderableList from 'react-native-reorderable-list';
import { ReorderableListReorderEvent } from 'react-native-reorderable-list/src/types/props';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

const HISTORY_PAGE_SIZE = 100;

type QueuePanelEntry = QueueTimelineEntry & { kind: 'queue' };
type HistoryPanelEntry = {
  entry: PlaybackHistoryEntry;
  isFirst: boolean;
  isLast: boolean;
  kind: 'history';
};
type PlayerPanelEntry = QueuePanelEntry | HistoryPanelEntry;

type PlayerQueueSheetProps = {
  allowsInteractiveDismiss?: boolean;
  usesTransparentHeader: boolean;
  visualizerActive: boolean;
};

export function PlayerQueueSheet({
  allowsInteractiveDismiss = false,
  usesTransparentHeader,
  visualizerActive,
}: PlayerQueueSheetProps) {
  'use no memo';

  const player = useRelistenPlayer();
  const { bottom: bottomSafeAreaInset } = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { closePlayer, openPlayer } = usePlayerPresentation();
  const orderedQueueTracks = useRelistenPlayerQueueOrderedTracks();
  const currentTrack = useRelistenPlayerCurrentTrack();
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);
  const [isNowPlayingOffscreen, setIsNowPlayingOffscreen] = useState(false);
  const [mode, setMode] = useState<PlayerPanelMode>('queue');
  const scrollOffset = useSharedValue(0);
  const nowPlayingHeight = useSharedValue(0);
  const isDismissalDragArmed = useSharedValue(false);
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

  const queueEntries = useMemo<QueuePanelEntry[]>(() => {
    const firstIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
    const tracks = orderedQueueTracks.slice(firstIndex);

    return tracks.map((queueTrack, offset) => ({
      isFirst: offset === 0,
      isLast: offset === tracks.length - 1,
      kind: 'queue',
      queueIndex: firstIndex + offset,
      queueTrack,
    }));
  }, [currentIndex, orderedQueueTracks]);

  const historyEntries = useMemo<HistoryPanelEntry[]>(() => {
    const entries = recentlyPlayed.slice(0, historyLimit);
    return entries.map((entry, index) => ({
      entry,
      isFirst: index === 0,
      isLast: index === entries.length - 1,
      kind: 'history',
    }));
  }, [historyLimit, recentlyPlayed, recentlyPlayed.length]);

  const panelEntries: PlayerPanelEntry[] = mode === 'queue' ? queueEntries : historyEntries;

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const rawOffset = event.contentOffset.y;
      scrollOffset.value = Math.max(rawOffset, 0);

      if (!allowsInteractiveDismiss || !isDismissalDragArmed.value) return;

      if (rawOffset < 0) {
        cancelAnimation(playerPresentationProgress);
        playerPresentationProgress.value = Math.max(
          0,
          Math.min(1, 1 + rawOffset / (height * 0.38))
        );
      } else if (playerPresentationProgress.value < 1) {
        playerPresentationProgress.value = 1;
      }
    },
  });

  useAnimatedReaction(
    () => nowPlayingHeight.value > 0 && scrollOffset.value >= nowPlayingHeight.value,
    (isOffscreen, wasOffscreen) => {
      if (isOffscreen !== wasOffscreen) runOnJS(setIsNowPlayingOffscreen)(isOffscreen);
    }
  );

  const handleScrollBeginDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!allowsInteractiveDismiss) return;
    isDismissalDragArmed.value = event.nativeEvent.contentOffset.y <= 1;
  };

  const handleScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!allowsInteractiveDismiss) return;

    const offset = event.nativeEvent.contentOffset.y;
    const velocity = event.nativeEvent.velocity?.y ?? 0;
    const canDismiss = isDismissalDragArmed.value && offset < 0;
    isDismissalDragArmed.value = false;

    if (canDismiss && (offset < -56 || velocity < -0.55)) {
      closePlayer();
    } else if (playerPresentationProgress.value < 1) {
      openPlayer();
    }
  };

  const loadMoreHistory = useCallback(() => {
    if (mode !== 'history') return;
    setHistoryLimit((limit) => Math.min(limit + HISTORY_PAGE_SIZE, recentlyPlayed.length));
  }, [mode, recentlyPlayed.length]);

  const nowPlayingStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.min(scrollOffset.value * 0.78, height * 0.16) }],
    zIndex: 0,
  }));

  const handleNowPlayingLayout = useCallback(
    (event: LayoutChangeEvent) => {
      nowPlayingHeight.value = event.nativeEvent.layout.height;
    },
    [nowPlayingHeight]
  );

  const triggerHaptics = useCallback(() => {
    'worklet';
    runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const onReorder = ({ from, to }: ReorderableListReorderEvent) => {
    const fromEntry = panelEntries[from];
    const toEntry = panelEntries[to];
    if (fromEntry?.kind === 'queue' && toEntry?.kind === 'queue') {
      player.queue.moveQueueTrack(fromEntry.queueIndex, toEntry.queueIndex);
    }
  };

  return (
    <ReorderableList
      alwaysBounceVertical={allowsInteractiveDismiss}
      contentInsetAdjustmentBehavior={usesTransparentHeader ? 'automatic' : 'never'}
      data={panelEntries}
      dragEnabled={mode === 'queue'}
      keyExtractor={(entry) =>
        entry.kind === 'queue'
          ? `queue-${entry.queueTrack.identifier}`
          : `history-${entry.entry.uuid}`
      }
      ListHeaderComponent={
        <View style={{ overflow: 'visible' }}>
          <View onLayout={handleNowPlayingLayout}>
            <Animated.View style={nowPlayingStyle}>
              <PlayerNowPlaying visualizerActive={visualizerActive && !isNowPlayingOffscreen} />
            </Animated.View>
          </View>
          <PlayerPanelHeader
            historyCount={recentlyPlayed.length}
            mode={mode}
            onModeChange={setMode}
            queueCount={queueEntries.length}
          />
        </View>
      }
      ListEmptyComponent={
        <PlayerPanelRow isFirst isLast>
          <View style={{ padding: 24 }}>
            <RelistenText className="text-center text-gray-300" selectable={false}>
              {mode === 'queue' ? 'Nothing else is queued' : 'No listening history yet'}
            </RelistenText>
          </View>
        </PlayerPanelRow>
      }
      ListFooterComponent={
        <View
          style={{
            backgroundColor: PLAYER_PANEL_BACKGROUND,
            height: bottomSafeAreaInset + 24,
            overflow: 'visible',
          }}
        >
          <View
            pointerEvents="none"
            style={{
              backgroundColor: PLAYER_PANEL_BACKGROUND,
              borderColor: PLAYER_PANEL_BORDER_COLOR,
              borderLeftWidth: 1,
              borderRightWidth: 1,
              height: bottomSafeAreaInset + 24 + height,
              left: 0,
              position: 'absolute',
              right: 0,
              top: 0,
            }}
          />
        </View>
      }
      onDragEnd={triggerHaptics}
      onDragStart={triggerHaptics}
      onEndReached={loadMoreHistory}
      onEndReachedThreshold={0.4}
      onIndexChange={triggerHaptics}
      onReorder={onReorder}
      onScroll={handleScroll}
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEndDrag}
      renderItem={({ item }) =>
        item.kind === 'queue' ? (
          <UpNextQueueItem entry={item} />
        ) : (
          <PlayerHistoryItem entry={item.entry} isFirst={item.isFirst} isLast={item.isLast} />
        )
      }
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
    />
  );
}
