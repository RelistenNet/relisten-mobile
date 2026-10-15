import { RelistenText } from '@/relisten/components/relisten_text';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import { PlayerAudioVisualizer } from '@/relisten/player/ui/player_audio_visualizer';
import { playerDisplayTitle, playerPosterDate } from '@/relisten/player/ui/player_display_helpers';
import { PlayerControls } from '@/relisten/player/ui/player_now_playing';
import { ScrubberRow } from '@/relisten/player/ui/player_scrubber';
import { TouchableOpacity, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, {
  interpolate,
  Extrapolation,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';

export function PlayerQueueTransport({
  onLayout,
  onReturn,
  onScrubbingChange,
  progress,
  interactive,
}: {
  onLayout: (event: LayoutChangeEvent) => void;
  onReturn: () => void;
  onScrubbingChange: (scrubbing: boolean) => void;
  progress: SharedValue<number>;
  interactive: boolean;
}) {
  const track = useRelistenPlayerCurrentTrack()?.sourceTrack;
  const { fontScale } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.55, 0.85], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: reduceMotion
          ? 0
          : interpolate(progress.value, [0.55, 0.85], [-12, 0], Extrapolation.CLAMP),
      },
      {
        scale: reduceMotion
          ? 1
          : interpolate(progress.value, [0.55, 0.85], [1.04, 1], Extrapolation.CLAMP),
      },
    ],
  }));
  if (!track) return null;
  const { day, month, year } = playerPosterDate(track.show.displayDate);

  return (
    <Animated.View
      accessibilityElementsHidden={!interactive}
      importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
      pointerEvents={interactive ? 'auto' : 'none'}
      className="absolute inset-x-0 top-0 border-b border-relisten-blue-500/30 bg-relisten-blue-900 px-5 pb-3 pt-2"
      onLayout={onLayout}
      style={[{ zIndex: 1000 }, animatedStyle]}
    >
      <View className={fontScale >= 1.4 ? 'gap-2' : 'flex-row gap-2'}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Return to Now Playing, ${playerDisplayTitle(track.title)}, ${track.artist.name}, ${track.show.displayDate}`}
          className={
            fontScale >= 1.4
              ? 'min-h-11 min-w-0 flex-row items-center'
              : 'min-h-11 min-w-0 flex-1 flex-row items-center'
          }
          onPress={onReturn}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="w-12 items-center rounded-md border border-relisten-blue-500/30 py-1"
          >
            <RelistenText
              className="text-xs text-relisten-blue-200"
              maxFontSizeMultiplier={1.2}
              selectable={false}
            >
              {month}
            </RelistenText>
            <RelistenText
              className="text-2xl text-relisten-blue-200"
              maxFontSizeMultiplier={1.2}
              selectable={false}
            >
              {day}
            </RelistenText>
            <RelistenText
              className="text-xs text-relisten-blue-200"
              maxFontSizeMultiplier={1.2}
              selectable={false}
            >
              {year}
            </RelistenText>
          </View>
          <View className="ml-3 min-w-0 flex-1">
            <RelistenText
              className="font-semibold"
              numberOfLines={fontScale >= 1.4 ? undefined : 2}
              selectable={false}
            >
              {playerDisplayTitle(track.title)}
            </RelistenText>
            <RelistenText
              className="mt-0.5 text-sm text-gray-300"
              numberOfLines={fontScale >= 1.4 ? undefined : 2}
              selectable={false}
            >
              {track.artist.name}
            </RelistenText>
          </View>
        </TouchableOpacity>
        <View className="justify-center">
          <PlayerControls compact />
        </View>
      </View>
      <View className="mb-2 mt-3">
        <PlayerAudioVisualizer compact active={interactive} />
      </View>
      <ScrubberRow subduedCache onScrubbingChange={onScrubbingChange} />
    </Animated.View>
  );
}
