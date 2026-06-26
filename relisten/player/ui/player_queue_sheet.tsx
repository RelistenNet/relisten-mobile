import { RelistenText } from '@/relisten/components/relisten_text';
import { SourceTrackOfflineIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import {
  useRelistenPlayerCurrentTrack,
  useRelistenPlayerQueueOrderedTracks,
} from '@/relisten/player/relisten_player_queue_hooks';
import { playerDisplayTitle, playerQueueDate } from '@/relisten/player/ui/player_display_helpers';
import { PlayerHistoryItem } from '@/relisten/player/ui/player_history_item';
import { PlayerNowPlaying } from '@/relisten/player/ui/player_now_playing';
import { PlayerPanelHeader, type PlayerPanelMode } from '@/relisten/player/ui/player_panel_header';
import { PlayerPanelRow } from '@/relisten/player/ui/player_panel_row';
import {
  playerPresentationProgress,
  usePlayerPresentation,
} from '@/relisten/player/ui/player_presentation';
import { PlayerQueueActionsMenu } from '@/relisten/player/ui/player_queue_actions_menu';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { useQuery } from '@/relisten/realm/schema';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import ReorderableList, { useReorderableDrag } from 'react-native-reorderable-list';
import { ReorderableListReorderEvent } from 'react-native-reorderable-list/src/types/props';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

type QueueEntry = {
  kind: 'queue';
  isFirst: boolean;
  isLast: boolean;
  queueIndex: number;
  queueTrack: PlayerQueueTrack;
};

type HistoryEntry = {
  kind: 'history';
  historyEntry: PlaybackHistoryEntry;
  isFirst: boolean;
  isLast: boolean;
};

type PlayerPanelEntry = QueueEntry | HistoryEntry;

const HISTORY_PAGE_SIZE = 100;

function QueueDragHandle({ drag, title }: { drag: () => void; title: string }) {
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);

  return (
    <TouchableOpacity
      accessibilityHint="Double tap and hold, then drag to reorder."
      accessibilityLabel={`Reorder ${title}`}
      accessibilityRole="button"
      className="justify-center"
      delayLongPress={250}
      onLongPress={drag}
      style={{
        alignItems: 'center',
        minHeight: 44 * controlScale,
        minWidth: 44 * controlScale,
      }}
    >
      <MaterialIcons
        color="rgba(255, 255, 255, 0.62)"
        name="drag-handle"
        size={24 * controlScale}
      />
    </TouchableOpacity>
  );
}

function PlayerQueueItem({ entry }: { entry: QueueEntry }) {
  const player = useRelistenPlayer();
  const drag = useReorderableDrag();
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);
  const { isFirst, isLast, queueIndex, queueTrack } = entry;
  const sourceTrack = queueTrack.sourceTrack;
  const isAccessibilityLayout = fontScale >= 1.4;
  const displayTitle = playerDisplayTitle(sourceTrack.title);
  const metadata = `${sourceTrack.artist.name} · ${playerQueueDate(sourceTrack.show.displayDate)}`;
  const accessibilityLabel = `${displayTitle}, ${metadata}, ${sourceTrack.humanizedDuration}`;
  const onPress = () => player.playTrackAtIndex(queueIndex);
  const titleAndMetadata = (
    <TouchableOpacity
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="min-w-0 flex-1"
      onPress={onPress}
    >
      <View className="flex-row items-start gap-1">
        <RelistenText
          className="min-w-0 shrink text-base font-semibold"
          numberOfLines={isAccessibilityLayout ? undefined : 2}
          selectable={false}
        >
          {displayTitle}
        </RelistenText>
        <SourceTrackOfflineIndicator offlineInfo={sourceTrack.offlineInfo} />
      </View>
      <RelistenText
        className="text-sm text-gray-300/70"
        numberOfLines={isAccessibilityLayout ? undefined : 2}
        selectable={false}
        style={{ marginTop: 4 }}
      >
        {metadata}
      </RelistenText>
    </TouchableOpacity>
  );

  if (isAccessibilityLayout) {
    return (
      <PlayerPanelRow isFirst={isFirst} isLast={isLast}>
        <View
          style={{
            paddingLeft: 12 * controlScale,
            paddingRight: 8 * controlScale,
            paddingVertical: 8 * controlScale,
          }}
        >
          {titleAndMetadata}
          <View className="flex-row items-center justify-end" style={{ marginTop: 8 }}>
            <RelistenText className="pr-2 text-gray-300" selectable={false}>
              {sourceTrack.humanizedDuration}
            </RelistenText>
            <PlayerQueueActionsMenu index={queueIndex} queueTrack={queueTrack} />
            <QueueDragHandle drag={drag} title={sourceTrack.title} />
          </View>
        </View>
      </PlayerPanelRow>
    );
  }

  return (
    <PlayerPanelRow isFirst={isFirst} isLast={isLast}>
      <View
        className="flex-row items-center"
        style={{ paddingLeft: 12 * controlScale, paddingVertical: 6 * controlScale }}
      >
        {titleAndMetadata}
        <RelistenText
          className="pl-2 text-gray-300"
          selectable={false}
          style={{ minWidth: 44 * controlScale, textAlign: 'right' }}
        >
          {sourceTrack.humanizedDuration}
        </RelistenText>
        <PlayerQueueActionsMenu index={queueIndex} queueTrack={queueTrack} />
        <QueueDragHandle drag={drag} title={sourceTrack.title} />
      </View>
    </PlayerPanelRow>
  );
}

type PlayerQueueSheetProps = {
  allowsInteractiveDismiss?: boolean;
  usesTransparentHeader: boolean;
};

export function PlayerQueueSheet({
  allowsInteractiveDismiss = false,
  usesTransparentHeader,
}: PlayerQueueSheetProps) {
  'use no memo';

  const player = useRelistenPlayer();
  const { bottom: bottomSafeAreaInset } = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { closePlayer, openPlayer } = usePlayerPresentation();
  const orderedQueueTracks = useRelistenPlayerQueueOrderedTracks();
  const currentTrack = useRelistenPlayerCurrentTrack();
  const [mode, setMode] = useState<PlayerPanelMode>('queue');
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);
  const scrollOffset = useSharedValue(0);
  const isDismissalDragArmed = useSharedValue(false);
  const recentlyPlayed = useQuery(
    {
      type: PlaybackHistoryEntry,
      query: (query) => query.sorted('playbackStartedAt', /* reverse= */ true),
    },
    []
  );

  const queueEntries = useMemo<QueueEntry[]>(() => {
    const currentIndex = currentTrack
      ? orderedQueueTracks.findIndex((track) => track.identifier === currentTrack.identifier)
      : -1;
    const firstVisibleIndex = currentIndex < 0 ? 0 : currentIndex + 1;
    const visibleTracks = orderedQueueTracks.slice(firstVisibleIndex);

    return visibleTracks.map((queueTrack, offset) => ({
      kind: 'queue',
      isFirst: offset === 0,
      isLast: offset === visibleTracks.length - 1,
      queueIndex: firstVisibleIndex + offset,
      queueTrack,
    }));
  }, [currentTrack, orderedQueueTracks]);

  const historyEntries = useMemo<HistoryEntry[]>(() => {
    const entries = recentlyPlayed.slice(0, historyLimit);

    return entries.map((historyEntry, index) => ({
      kind: 'history',
      historyEntry,
      isFirst: index === 0,
      isLast: index === entries.length - 1,
    }));
  }, [historyLimit, recentlyPlayed]);

  const panelEntries: PlayerPanelEntry[] = mode === 'queue' ? queueEntries : historyEntries;

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const rawOffset = event.contentOffset.y;
      const nextOffset = Math.max(rawOffset, 0);
      scrollOffset.value = nextOffset;

      if (allowsInteractiveDismiss && isDismissalDragArmed.value) {
        if (rawOffset < 0) {
          cancelAnimation(playerPresentationProgress);
          playerPresentationProgress.value = Math.max(
            0,
            Math.min(1, 1 + rawOffset / (height * 0.38))
          );
        } else if (playerPresentationProgress.value < 1) {
          playerPresentationProgress.value = 1;
        }
      }
    },
  });

  const handleScrollBeginDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!allowsInteractiveDismiss) {
      return;
    }

    isDismissalDragArmed.value = event.nativeEvent.contentOffset.y <= 1;
  };

  const handleScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!allowsInteractiveDismiss) {
      return;
    }

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
    if (mode !== 'history') {
      return;
    }

    setHistoryLimit((limit) => Math.min(limit + HISTORY_PAGE_SIZE, recentlyPlayed.length));
  }, [mode, recentlyPlayed.length]);

  const nowPlayingStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.min(scrollOffset.value * 0.78, height * 0.16) }],
    zIndex: 0,
  }));

  const triggerHaptics = useCallback(() => {
    'worklet';
    runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const onReorder = ({ from, to }: ReorderableListReorderEvent) => {
    const fromEntry = panelEntries[from];
    const toEntry = panelEntries[to];

    if (fromEntry?.kind !== 'queue' || toEntry?.kind !== 'queue') {
      return;
    }

    player.queue.moveQueueTrack(fromEntry.queueIndex, toEntry.queueIndex);
  };

  return (
    <ReorderableList
      alwaysBounceVertical={allowsInteractiveDismiss}
      contentContainerStyle={{ paddingBottom: bottomSafeAreaInset + 24 }}
      contentInsetAdjustmentBehavior={usesTransparentHeader ? 'automatic' : 'never'}
      data={panelEntries}
      dragEnabled={mode === 'queue'}
      keyExtractor={(entry) =>
        entry.kind === 'queue'
          ? `queue-${entry.queueTrack.identifier}`
          : `history-${entry.historyEntry.uuid}`
      }
      ListHeaderComponent={
        <View style={{ overflow: 'visible' }}>
          <Animated.View style={nowPlayingStyle}>
            <PlayerNowPlaying />
          </Animated.View>
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
          <View className="p-6">
            <RelistenText className="text-center text-gray-300" selectable={false}>
              {mode === 'queue' ? 'Nothing else is queued' : 'No listening history yet'}
            </RelistenText>
          </View>
        </PlayerPanelRow>
      }
      onDragEnd={triggerHaptics}
      onDragStart={triggerHaptics}
      onIndexChange={triggerHaptics}
      onEndReached={loadMoreHistory}
      onEndReachedThreshold={0.4}
      onReorder={onReorder}
      onScroll={handleScroll}
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEndDrag}
      renderItem={({ item }) =>
        item.kind === 'queue' ? (
          <PlayerQueueItem entry={item} />
        ) : (
          <PlayerHistoryItem
            entry={item.historyEntry}
            isFirst={item.isFirst}
            isLast={item.isLast}
          />
        )
      }
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
    />
  );
}
