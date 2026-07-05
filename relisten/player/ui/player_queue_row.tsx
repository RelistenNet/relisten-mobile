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
  onDragStart?: () => void;
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
        onDragStart?.();
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
  const isAccessibilityLayout = fontScale >= 1.4;
  const displayTitle = playerDisplayTitle(sourceTrack.title);
  const metadata = playerTrackMetadata(sourceTrack);
  const titleAndMetadata = (
    <TouchableOpacity
      accessibilityHint={playbackHint}
      accessibilityLabel={`${displayTitle}, ${metadata}, ${sourceTrack.humanizedDuration}`}
      accessibilityRole="button"
      onPress={() => player.playTrackAtIndex(queueIndex)}
      style={{ flex: 1, minWidth: 0, paddingVertical: 3 * controlScale }}
    >
      <View style={{ alignItems: 'flex-start', flexDirection: 'row', minWidth: 0 }}>
        <RelistenText
          className="shrink text-base font-semibold"
          numberOfLines={isAccessibilityLayout ? undefined : 2}
          selectable={false}
          style={{ flex: 1, flexShrink: 1 }}
        >
          {displayTitle}
        </RelistenText>
        <SourceTrackOfflineIndicator offlineInfo={sourceTrack.offlineInfo} />
      </View>
      <RelistenText
        className="text-sm text-gray-300/70"
        numberOfLines={isAccessibilityLayout ? undefined : 2}
        selectable={false}
        style={{ marginTop: 3 * controlScale }}
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
            paddingVertical: 8 * controlScale,
          }}
        >
          {titleAndMetadata}
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'flex-end',
              marginTop: 6 * controlScale,
            }}
          >
            <RelistenText
              className="text-gray-300"
              selectable={false}
              style={{ fontVariant: ['tabular-nums'], marginRight: 8 * controlScale }}
            >
              {sourceTrack.humanizedDuration}
            </RelistenText>
            {action}
          </View>
        </View>
      </PlayerPanelRow>
    );
  }

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
        {titleAndMetadata}
        <RelistenText
          className="text-gray-300"
          selectable={false}
          style={{
            fontVariant: ['tabular-nums'],
            marginLeft: 10 * controlScale,
            minWidth: 42 * controlScale,
            textAlign: 'right',
          }}
        >
          {sourceTrack.humanizedDuration}
        </RelistenText>
        {action}
      </View>
    </PlayerPanelRow>
  );
}

export function UpNextQueueItem({
  entry,
  onReorderStart,
}: {
  entry: QueueTimelineEntry;
  onReorderStart?: () => void;
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
