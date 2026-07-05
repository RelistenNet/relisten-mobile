import { RelistenText } from '@/relisten/components/relisten_text';
import { SourceTrackOfflineIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import {
  playerDisplayTitle,
  playerTrackMetadata,
} from '@/relisten/player/ui/player_display_helpers';
import { PlayerPanelRow } from '@/relisten/player/ui/player_panel_row';
import { PlayerQueueActionsMenu } from '@/relisten/player/ui/player_queue_actions_menu';
import { MaterialIcons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { TouchableOpacity, useWindowDimensions, View } from 'react-native';

export type QueueTimelineEntry = {
  isFirst: boolean;
  isLast: boolean;
  queueIndex: number;
  queueTrack: PlayerQueueTrack;
};

function QueueDragHandle({
  drag,
  onDragStart,
  title,
}: {
  drag: () => void;
  onDragStart: () => void;
  title: string;
}) {
  return (
    <TouchableOpacity
      accessibilityHint="Double tap and hold, then drag to reorder."
      accessibilityLabel={`Reorder ${title}`}
      accessibilityRole="button"
      delayLongPress={250}
      className="h-11 w-11 items-center justify-center"
      onLongPress={() => {
        onDragStart();
        drag();
      }}
    >
      <View className="-translate-x-2.5">
        <MaterialIcons color="rgba(255, 255, 255, 0.62)" name="drag-handle" size={24} />
      </View>
    </TouchableOpacity>
  );
}

function QueueTrackRow({
  action,
  entry,
  playbackHint,
}: {
  action?: ReactNode;
  entry: QueueTimelineEntry;
  playbackHint: string;
}) {
  const player = useRelistenPlayer();
  const { fontScale } = useWindowDimensions();
  const { isFirst, isLast, queueIndex, queueTrack } = entry;
  const sourceTrack = queueTrack.sourceTrack;
  const displayTitle = playerDisplayTitle(sourceTrack.title);
  const metadata = playerTrackMetadata(sourceTrack);

  return (
    <PlayerPanelRow isFirst={isFirst} isLast={isLast}>
      <View className="flex-row items-center py-1.5 pl-3">
        <TouchableOpacity
          accessibilityHint={playbackHint}
          accessibilityLabel={`${displayTitle}, ${metadata}, ${sourceTrack.humanizedDuration}`}
          accessibilityRole="button"
          className="min-w-0 flex-1 py-1"
          onPress={() => player.playTrackAtIndex(queueIndex)}
        >
          <View className="min-w-0 flex-row items-start">
            <RelistenText
              className="flex-1 shrink text-base font-semibold"
              numberOfLines={fontScale <= 1.2 ? 2 : undefined}
              selectable={false}
            >
              {displayTitle}
            </RelistenText>
            <SourceTrackOfflineIndicator offlineInfo={sourceTrack.offlineInfo} />
          </View>
          <RelistenText
            className="mt-[3px] text-sm text-gray-300/70"
            numberOfLines={fontScale <= 1.2 ? 2 : undefined}
            selectable={false}
          >
            {metadata}
          </RelistenText>
        </TouchableOpacity>
        <RelistenText
          className="ml-2.5 min-w-[42px] text-right text-gray-300 tabular-nums"
          selectable={false}
        >
          {sourceTrack.humanizedDuration}
        </RelistenText>
        {action}
      </View>
    </PlayerPanelRow>
  );
}

export function EarlierQueueItem({ entry }: { entry: QueueTimelineEntry }) {
  return (
    <QueueTrackRow
      action={<PlayerQueueActionsMenu index={entry.queueIndex} queueTrack={entry.queueTrack} />}
      entry={entry}
      playbackHint="Plays this earlier queue item now."
    />
  );
}

export function UpNextQueueItem({
  drag,
  entry,
  onReorderStart,
}: {
  drag: () => void;
  entry: QueueTimelineEntry;
  onReorderStart: () => void;
}) {
  return (
    <QueueTrackRow
      action={
        <>
          <PlayerQueueActionsMenu index={entry.queueIndex} queueTrack={entry.queueTrack} />
          <QueueDragHandle
            drag={drag}
            onDragStart={onReorderStart}
            title={entry.queueTrack.sourceTrack.title}
          />
        </>
      }
      entry={entry}
      playbackHint="Plays this queued track now."
    />
  );
}
