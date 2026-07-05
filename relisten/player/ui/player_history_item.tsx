import { HistoryEntryContent } from '@/relisten/history/history_entry_content';
import { HistoryTrackActionsMenu } from '@/relisten/history/history_track_actions_menu';
import {
  RelativePlaybackTime,
  spokenRelativePlaybackTime,
} from '@/relisten/history/relative_playback_time';
import { PlayerPanelRow } from '@/relisten/player/ui/player_panel_row';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { View } from 'react-native';

type PlayerHistoryItemProps = {
  entry: PlaybackHistoryEntry;
  isFirst: boolean;
  isLast: boolean;
  onViewShow: () => void;
};

export function PlayerHistoryItem({ entry, isFirst, isLast, onViewShow }: PlayerHistoryItemProps) {
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
          className="px-2"
          importantForAccessibility="no-hide-descendants"
        >
          <HistoryEntryContent
            action={
              <View className="min-h-11 min-w-11 items-center justify-center">
                <Ionicons
                  color="rgba(255, 255, 255, 0.72)"
                  name="ellipsis-horizontal-circle-outline"
                  size={21}
                />
              </View>
            }
            leading={
              <View className="min-w-8 items-center justify-center">
                <MaterialIcons color="rgba(255, 255, 255, 0.58)" name="history" size={21} />
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
