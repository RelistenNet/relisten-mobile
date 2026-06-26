import { RelistenText } from '@/relisten/components/relisten_text';
import { SourceTrackOfflineIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import { playerDisplayTitle, playerQueueDate } from '@/relisten/player/ui/player_display_helpers';
import { PlayerPanelRow } from '@/relisten/player/ui/player_panel_row';
import { SourceTrackActionsMenu } from '@/relisten/player/ui/source_track_actions_menu';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, type ReactNode } from 'react';
import { TouchableOpacity, useWindowDimensions, View } from 'react-native';
import TimeAgo, { type Formatter, type Unit } from 'react-timeago';

const TIME_UNIT_LABELS: Record<Unit, string> = {
  second: 's',
  minute: 'm',
  hour: 'h',
  day: 'd',
  week: 'w',
  month: 'mo',
  year: 'y',
};

const compactTimeAgo: Formatter = (value, unit, suffix) =>
  `${value}${TIME_UNIT_LABELS[unit]} ${suffix}`;

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
  const metadata = [
    sourceTrack.artist.name,
    playerQueueDate(sourceTrack.show.displayDate),
    sourceTrack.show.venue?.name,
  ]
    .filter(Boolean)
    .join(' · ');
  const accessibilityLabel = `${displayTitle}, ${metadata}, played ${entry.playbackStartedAt.toLocaleString()}`;

  const playHistoryTrack = useCallback(
    (track?: SourceTrack) => {
      if (!track?.streamingUrl()) {
        return;
      }

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
      className="min-w-0 flex-1"
      onPress={() => playHistoryTrack(sourceTrack)}
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

  const relativeTime = (
    <TimeAgo
      component={({ children }: { children?: ReactNode }) => (
        <RelistenText
          className="text-sm text-gray-300"
          maxFontSizeMultiplier={1.6}
          numberOfLines={1}
          selectable={false}
        >
          {children}
        </RelistenText>
      )}
      date={entry.playbackStartedAt}
      formatter={compactTimeAgo}
      minPeriod={30}
    />
  );

  return (
    <PlayerPanelRow isFirst={isFirst} isLast={isLast}>
      <View className="px-2 py-3">
        <View className="flex-row items-center">
          <View
            accessibilityElementsHidden
            className="items-center justify-center"
            importantForAccessibility="no-hide-descendants"
            style={{ minWidth: 34 * controlScale }}
          >
            <MaterialIcons
              color="rgba(255, 255, 255, 0.58)"
              name="history"
              size={21 * controlScale}
            />
          </View>
          {titleAndMetadata}
          {!isAccessibilityLayout && (
            <View className="items-end pl-2" style={{ minWidth: 58 * controlScale }}>
              {relativeTime}
            </View>
          )}
          <SourceTrackActionsMenu playShow={playHistoryTrack} sourceTrack={sourceTrack} />
        </View>
        {isAccessibilityLayout && (
          <View className="items-start" style={{ marginLeft: 34 * controlScale, marginTop: 8 }}>
            {relativeTime}
          </View>
        )}
      </View>
    </PlayerPanelRow>
  );
}
