import { RelistenText } from '@/relisten/components/relisten_text';
import { SourceTrackOfflineIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import {
  RelativePlaybackTime,
  spokenRelativePlaybackTime,
} from '@/relisten/history/relative_playback_time';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import {
  playerDisplayTitle,
  playerTrackMetadata,
} from '@/relisten/player/ui/player_display_helpers';
import { PlayerPanelRow } from '@/relisten/player/ui/player_panel_row';
import { SourceTrackActionsMenu } from '@/relisten/player/ui/source_track_actions_menu';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import { MaterialIcons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { TouchableOpacity, useWindowDimensions, View } from 'react-native';

type PlayerHistoryItemProps = {
  entry: PlaybackHistoryEntry;
  isFirst: boolean;
  isLast: boolean;
};

export function PlayerHistoryItem({ entry, isFirst, isLast }: PlayerHistoryItemProps) {
  const player = useRelistenPlayer();
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);
  const isAccessibilityLayout = fontScale >= 1.4;
  const sourceTrack = entry.sourceTrack;
  const displayTitle = playerDisplayTitle(sourceTrack.title);
  const metadata = playerTrackMetadata(sourceTrack);
  const accessibilityLabel = [
    displayTitle,
    metadata,
    spokenRelativePlaybackTime(entry.playbackStartedAt),
    `played at ${entry.playbackStartedAt.toLocaleString()}`,
  ].join(', ');

  const playHistoryTrack = useCallback(
    (track?: SourceTrack) => {
      if (!track?.streamingUrl()) return;

      const queueTrack = PlayerQueueTrack.fromSourceTrack(track);
      const currentIndex = player.queue.currentIndex;
      if (currentIndex === undefined) {
        player.queue.replaceQueue([queueTrack], 0, { resetShuffle: true });
        return;
      }

      player.queue.queueNextTrack([queueTrack]);
      player.playTrackAtIndex(currentIndex + 1);
    },
    [player]
  );

  const titleAndMetadata = (
    <TouchableOpacity
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={() => playHistoryTrack(sourceTrack)}
      style={{ flex: 1, minWidth: 0, paddingVertical: 3 * controlScale }}
    >
      <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: 4, minWidth: 0 }}>
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

  return (
    <PlayerPanelRow isFirst={isFirst} isLast={isLast}>
      <View
        style={{
          paddingLeft: 12 * controlScale,
          paddingVertical: (isAccessibilityLayout ? 8 : 5) * controlScale,
        }}
      >
        <View style={{ alignItems: 'center', flexDirection: 'row' }}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ alignItems: 'center', justifyContent: 'center', minWidth: 34 * controlScale }}
          >
            <MaterialIcons
              color="rgba(255, 255, 255, 0.58)"
              name="history"
              size={21 * controlScale}
            />
          </View>
          {titleAndMetadata}
          {!isAccessibilityLayout && (
            <View
              style={{
                alignItems: 'flex-end',
                marginLeft: 10 * controlScale,
                minWidth: 54 * controlScale,
              }}
            >
              <RelativePlaybackTime date={entry.playbackStartedAt} />
            </View>
          )}
          <SourceTrackActionsMenu playShow={playHistoryTrack} sourceTrack={sourceTrack} />
        </View>
        {isAccessibilityLayout && (
          <View style={{ marginLeft: 34 * controlScale, marginTop: 8 * controlScale }}>
            <RelativePlaybackTime date={entry.playbackStartedAt} />
          </View>
        )}
      </View>
    </PlayerPanelRow>
  );
}
