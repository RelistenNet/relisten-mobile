import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SourceTrackOfflineIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import {
  useRelistenPlayer,
  useRelistenPlayerPlaybackState,
} from '@/relisten/player/relisten_player_hooks';
import { type PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import { MaterialIcons } from '@expo/vector-icons';
import { TouchableOpacity, useWindowDimensions, View } from 'react-native';
import {
  playerDisplayTitle,
  playerTrackAccessibilityLabel,
  playerQueueDate,
} from './player_display_helpers';
import { PlayerQueueActionsMenu } from './player_queue_actions_menu';
import { QueueDragHandle } from './player_queue_row';

function CurrentTrackPlaybackButton() {
  const player = useRelistenPlayer();
  const state = useRelistenPlayerPlaybackState();
  const playing = state === RelistenPlaybackState.Playing;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause current track' : 'Resume current track'}
      className="h-11 w-11 items-center justify-center"
      onPress={() => player.togglePauseResume()}
    >
      <MaterialIcons
        name={playing ? 'pause-circle-filled' : 'play-circle-filled'}
        size={32}
        color="white"
      />
    </TouchableOpacity>
  );
}

export function PlayerQueueTrayRow({
  track,
  index,
  current,
  showArtist,
  drag,
}: {
  track: PlayerQueueTrack;
  index: number;
  current: boolean;
  showArtist: boolean;
  drag: () => void;
}) {
  const player = useRelistenPlayer();
  const source = track.sourceTrack;
  const { fontScale } = useWindowDimensions();
  const stackControls = fontScale >= 1.4;
  return (
    <View className={stackControls ? 'px-4' : 'flex-row items-center px-4'}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={playerTrackAccessibilityLabel(source)}
        accessibilityState={{ selected: current }}
        accessibilityHint={
          current ? 'Pauses or resumes the current track.' : 'Plays this queued track.'
        }
        className={
          stackControls
            ? 'min-h-[44px] justify-center py-2'
            : 'min-h-[44px] min-w-0 flex-1 justify-center py-2'
        }
        onPress={() => (current ? player.togglePauseResume() : player.playTrackAtIndex(index))}
      >
        <View className="flex-row items-center gap-1.5">
          <RelistenText
            className={
              current
                ? 'min-w-0 flex-1 text-base font-semibold text-relisten-blue-200'
                : 'min-w-0 flex-1 text-base font-semibold'
            }
            numberOfLines={stackControls ? undefined : 2}
            selectable={false}
          >
            {playerDisplayTitle(source.title)}
          </RelistenText>
          <SourceTrackOfflineIndicator offlineInfo={source.offlineInfo} />
        </View>
        <RelistenText
          className="mt-[3px] text-sm text-gray-300/70"
          numberOfLines={stackControls ? undefined : 1}
          selectable={false}
        >
          {[playerQueueDate(source.show.displayDate), source.show.venue?.name]
            .filter(Boolean)
            .join(' · ')}
        </RelistenText>
        {showArtist && (
          <RelistenText
            className="mt-[3px] text-sm text-gray-300/70"
            numberOfLines={stackControls ? undefined : 1}
            selectable={false}
          >
            {source.artist.name}
          </RelistenText>
        )}
      </TouchableOpacity>
      <View
        className={
          stackControls ? 'mt-1 flex-row items-center justify-end' : 'flex-row items-center'
        }
      >
        {current ? (
          <CurrentTrackPlaybackButton />
        ) : (
          <View className="h-11 min-w-[44px] items-center justify-center">
            <RelistenText className="text-base text-gray-400 tabular-nums" selectable={false}>
              {source.humanizedDuration}
            </RelistenText>
          </View>
        )}
        <PlayerQueueActionsMenu index={index} queueTrack={track} iconAlignment="center" />
        <QueueDragHandle drag={drag} label={playerTrackAccessibilityLabel(source)} />
      </View>
    </View>
  );
}
