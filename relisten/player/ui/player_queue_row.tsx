import { RelistenText } from '@/relisten/components/relisten_text';
import { SourceTrackOfflineIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import { playerDisplayTitle, playerQueueDate } from '@/relisten/player/ui/player_display_helpers';
import { PlayerPanelRow } from '@/relisten/player/ui/player_panel_row';
import { PlayerQueueActionsMenu } from '@/relisten/player/ui/player_queue_actions_menu';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import { MaterialIcons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useReorderableDrag } from 'react-native-reorderable-list';

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
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);

  return (
    <TouchableOpacity
      accessibilityHint="Double tap and hold, then drag to reorder."
      accessibilityLabel={`Reorder ${title}`}
      accessibilityRole="button"
      delayLongPress={250}
      onLongPress={() => {
        onDragStart();
        drag();
      }}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
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
  const controlScale = accessibleControlScale(fontScale);
  const { isFirst, isLast, queueIndex, queueTrack } = entry;
  const sourceTrack = queueTrack.sourceTrack;
  const displayTitle = playerDisplayTitle(sourceTrack.title);
  const metadata = [
    sourceTrack.artist.name,
    playerQueueDate(sourceTrack.show.displayDate),
    sourceTrack.show.venue?.name,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <PlayerPanelRow isFirst={isFirst} isLast={isLast}>
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          paddingLeft: 12 * controlScale,
          paddingVertical: 5 * controlScale,
        }}
      >
        <TouchableOpacity
          accessibilityHint={playbackHint}
          accessibilityLabel={`${displayTitle}, ${metadata}, ${sourceTrack.humanizedDuration}`}
          accessibilityRole="button"
          onPress={() => player.playTrackAtIndex(queueIndex)}
          style={{ flex: 1, minWidth: 0, paddingVertical: 3 }}
        >
          <View style={{ alignItems: 'flex-start', flexDirection: 'row', minWidth: 0 }}>
            <RelistenText
              className="shrink text-base font-semibold"
              numberOfLines={fontScale <= 1.2 ? 2 : undefined}
              selectable={false}
              style={{ flex: 1, flexShrink: 1 }}
            >
              {displayTitle}
            </RelistenText>
            <SourceTrackOfflineIndicator offlineInfo={sourceTrack.offlineInfo} />
          </View>
          <RelistenText
            className="text-sm text-gray-300/70"
            numberOfLines={fontScale <= 1.2 ? 2 : undefined}
            selectable={false}
            style={{ marginTop: 3 }}
          >
            {metadata}
          </RelistenText>
        </TouchableOpacity>
        <RelistenText
          className="pl-2 text-gray-300"
          selectable={false}
          style={{ minWidth: 44 * controlScale, textAlign: 'right' }}
        >
          {sourceTrack.humanizedDuration}
        </RelistenText>
        {action}
      </View>
    </PlayerPanelRow>
  );
}

export function EarlierQueueItem({ entry }: { entry: QueueTimelineEntry }) {
  return <QueueTrackRow entry={entry} playbackHint="Plays this earlier queue item now." />;
}

export function UpNextQueueItem({
  entry,
  onReorderStart,
}: {
  entry: QueueTimelineEntry;
  onReorderStart: () => void;
}) {
  const drag = useReorderableDrag();

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
