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
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

type QueueEntry = {
  kind: 'queue';
  displayPosition: number;
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

function QueueDragHandle({ drag, title }: { drag: () => void; title: string }) {
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);

  return (
    <TouchableOpacity
      accessibilityHint="Double tap and hold, then drag to reorder."
      accessibilityLabel={`Reorder ${title}`}
      accessibilityRole="button"
      className="items-center justify-center"
      delayLongPress={250}
      onLongPress={drag}
      style={{ minHeight: 44 * controlScale, minWidth: 44 * controlScale }}
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
  const { displayPosition, isFirst, isLast, queueIndex, queueTrack } = entry;
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
        <View className="px-3 py-3">
          <View className="flex-row items-start gap-2">
            <View className="items-center pt-1" style={{ minWidth: 30 * controlScale }}>
              <RelistenText className="text-gray-400" selectable={false}>
                {displayPosition}
              </RelistenText>
            </View>
            {titleAndMetadata}
          </View>
          <View
            className="flex-row items-center"
            style={{ marginLeft: 30 * controlScale + 8, marginTop: 8 }}
          >
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
      <View className="flex-row items-center px-3 py-3">
        <View className="items-center justify-center" style={{ minWidth: 34 * controlScale }}>
          <RelistenText className="text-gray-400" selectable={false}>
            {displayPosition}
          </RelistenText>
        </View>
        {titleAndMetadata}
        <RelistenText
          className="pl-2 text-gray-300"
          selectable={false}
          style={{ minWidth: 48 * controlScale, textAlign: 'right' }}
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
  const { height } = useWindowDimensions();
  const { closePlayer, openPlayer } = usePlayerPresentation();
  const orderedQueueTracks = useRelistenPlayerQueueOrderedTracks();
  const currentTrack = useRelistenPlayerCurrentTrack();
  const [mode, setMode] = useState<PlayerPanelMode>('queue');
  const scrollOffset = useSharedValue(0);
  const isScrollDragging = useSharedValue(false);
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
      displayPosition: offset + 1,
      isFirst: offset === 0,
      isLast: offset === visibleTracks.length - 1,
      queueIndex: firstVisibleIndex + offset,
      queueTrack,
    }));
  }, [currentTrack, orderedQueueTracks]);

  const historyEntries = useMemo<HistoryEntry[]>(() => {
    const entries = recentlyPlayed.slice(0, 300);

    return entries.map((historyEntry, index) => ({
      kind: 'history',
      historyEntry,
      isFirst: index === 0,
      isLast: index === entries.length - 1,
    }));
  }, [recentlyPlayed]);

  const panelEntries: PlayerPanelEntry[] = mode === 'queue' ? queueEntries : historyEntries;

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const rawOffset = event.contentOffset.y;
      const nextOffset = Math.max(rawOffset, 0);
      scrollOffset.value = nextOffset;

      if (allowsInteractiveDismiss && isScrollDragging.value && rawOffset < 0) {
        cancelAnimation(playerPresentationProgress);
        playerPresentationProgress.value = Math.max(
          0,
          Math.min(1, 1 + rawOffset / (height * 0.38))
        );
      }
    },
  });

  const handleScrollBeginDrag = () => {
    if (!allowsInteractiveDismiss) {
      return;
    }

    isScrollDragging.value = true;
  };

  const handleScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!allowsInteractiveDismiss) {
      return;
    }

    isScrollDragging.value = false;

    const offset = event.nativeEvent.contentOffset.y;
    const velocity = event.nativeEvent.velocity?.y ?? 0;

    if (offset < -56 || velocity < -0.55) {
      closePlayer();
    } else if (offset < 0) {
      openPlayer();
    }
  };

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
      contentContainerStyle={{ paddingBottom: 24 }}
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
            historyCount={historyEntries.length}
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
