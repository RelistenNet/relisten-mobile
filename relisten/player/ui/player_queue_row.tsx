import { RelistenText } from '@/relisten/components/relisten_text';
import { SourceTrackOfflineIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import {
  playerDisplayTitle,
  playerQueueDate,
  playerTrackAccessibilityLabel,
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

function QueueDragHandle({ drag, label }: { drag: () => void; label: string }) {
  return (
    <TouchableOpacity
      accessibilityHint="Double tap and hold, then drag to reorder."
      accessibilityLabel={`Reorder ${label}`}
      accessibilityRole="button"
      delayLongPress={250}
      className="h-11 w-11 items-center justify-center"
      onLongPress={() => {
        drag();
      }}
    >
      <MaterialIcons color="rgba(255, 255, 255, 0.62)" name="drag-handle" size={24} />
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
  const stackMetadata = fontScale > 1.2;
  const { isFirst, isLast, queueIndex, queueTrack } = entry;
  const sourceTrack = queueTrack.sourceTrack;
  const displayTitle = playerDisplayTitle(sourceTrack.title);
  const performanceLabel = playerTrackAccessibilityLabel(sourceTrack);

  return (
    <PlayerPanelRow isFirst={isFirst} isLast={isLast}>
      <View className="min-h-[62px] flex-row items-center py-1 pl-3">
        <TouchableOpacity
          accessibilityHint={playbackHint}
          accessibilityLabel={`${performanceLabel}, ${sourceTrack.humanizedDuration}`}
          accessibilityRole="button"
          className="min-w-0 flex-1 py-1"
          onPress={() => player.playTrackAtIndex(queueIndex)}
        >
          <View className="min-w-0 flex-row items-start">
            <RelistenText
              className="flex-1 shrink text-lg font-semibold"
              numberOfLines={stackMetadata ? undefined : 2}
              selectable={false}
            >
              {displayTitle}
            </RelistenText>
            <SourceTrackOfflineIndicator offlineInfo={sourceTrack.offlineInfo} />
          </View>
          {/* Reserve the date at normal sizes; stack it when both labels need room to wrap. */}
          <View className={`mt-[3px] min-w-0 ${stackMetadata ? '' : 'flex-row items-baseline'}`}>
            <RelistenText
              className="min-w-0 shrink text-sm text-gray-300/70"
              numberOfLines={stackMetadata ? undefined : 1}
              selectable={false}
            >
              {sourceTrack.artist.name}
            </RelistenText>
            <RelistenText className="shrink-0 text-sm text-gray-300/70" selectable={false}>
              {stackMetadata ? '' : ' · '}
              {playerQueueDate(sourceTrack.show.displayDate)}
            </RelistenText>
          </View>
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

export function UpNextQueueItem({ drag, entry }: { drag: () => void; entry: QueueTimelineEntry }) {
  return (
    <QueueTrackRow
      action={
        <>
          <PlayerQueueActionsMenu
            iconAlignment="center"
            index={entry.queueIndex}
            queueTrack={entry.queueTrack}
          />
          <QueueDragHandle
            drag={drag}
            label={playerTrackAccessibilityLabel(entry.queueTrack.sourceTrack)}
          />
        </>
      }
      entry={entry}
      playbackHint="Plays this queued track now."
    />
  );
}
