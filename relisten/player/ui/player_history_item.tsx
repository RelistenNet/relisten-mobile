import { HistoryEntryContent } from '@/relisten/history/history_entry_content';
import { HistoryTrackActionsMenu } from '@/relisten/history/history_track_actions_menu';
import {
  RelativePlaybackTime,
  spokenRelativePlaybackTime,
} from '@/relisten/history/relative_playback_time';
import { PlayerPanelRow } from '@/relisten/player/ui/player_panel_row';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useWindowDimensions, View } from 'react-native';

type PlayerHistoryItemProps = {
  entry: PlaybackHistoryEntry;
  isFirst: boolean;
  isLast: boolean;
  onViewShow: () => void;
};

export function PlayerHistoryItem({ entry, isFirst, isLast, onViewShow }: PlayerHistoryItemProps) {
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);
  const sourceTrack = entry.sourceTrack;
  const venue = sourceTrack.show.venue;
  const accessibilityLabel = [
    sourceTrack.title,
    sourceTrack.artist.name,
    sourceTrack.show.displayDate,
    venue?.name,
    venue?.location,
    spokenRelativePlaybackTime(entry.playbackStartedAt),
    `played at ${entry.playbackStartedAt.toLocaleString()}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <HistoryTrackActionsMenu
      accessibilityHint="Opens queue actions for this track."
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onViewShow={onViewShow}
      sourceTrack={sourceTrack}
    >
      <PlayerPanelRow isFirst={isFirst} isLast={isLast}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ paddingHorizontal: 8 }}
        >
          <HistoryEntryContent
            action={
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 44 * controlScale,
                  minWidth: 44 * controlScale,
                }}
              >
                <Ionicons
                  color="rgba(255, 255, 255, 0.72)"
                  name="ellipsis-horizontal-circle-outline"
                  size={21 * controlScale}
                />
              </View>
            }
            leading={
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 34 * controlScale,
                }}
              >
                <MaterialIcons
                  color="rgba(255, 255, 255, 0.58)"
                  name="history"
                  size={21 * controlScale}
                />
              </View>
            }
            sourceTrack={sourceTrack}
            trailing={<RelativePlaybackTime date={entry.playbackStartedAt} />}
          />
        </View>
      </PlayerPanelRow>
    </HistoryTrackActionsMenu>
  );
}
