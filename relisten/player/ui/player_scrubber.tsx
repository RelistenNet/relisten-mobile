import Flex from '@/relisten/components/flex';
import {
  useNativeActiveTrackDownloadProgress,
  useNativePlaybackProgress,
} from '@/relisten/player/native_playback_state_hooks';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { trackDuration } from '@/relisten/util/duration';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { HapticModeEnum, Slider } from 'react-native-awesome-slider';
import { useSharedValue } from 'react-native-reanimated';
import { useRelistenCastStatus } from '@/relisten/casting/cast_ui';
import { playbackTimePreference } from './playback_time_preference';

type ScrubberRowProps = {
  showTimes?: boolean;
  subduedCache?: boolean;
  onScrubbingChange?: (scrubbing: boolean) => void;
};

/** Seek control shared by both player headers, with an optional persistent time display. */
export function ScrubberRow({
  showTimes = true,
  subduedCache = false,
  onScrubbingChange,
}: ScrubberRowProps) {
  'use no memo';

  const progressObj = useNativePlaybackProgress();
  const downloadProgress = useNativeActiveTrackDownloadProgress();
  const player = useRelistenPlayer();
  const { isCasting } = useRelistenCastStatus();
  const timeDisplay = useSyncExternalStore(
    playbackTimePreference.subscribe,
    playbackTimePreference.getSnapshot,
    playbackTimePreference.getSnapshot
  );
  const elapsed = progressObj?.elapsed ?? 0;
  const duration = progressObj?.duration ?? 0;
  const displayedTime = trackDuration(
    timeDisplay === 'remaining' ? Math.max(0, duration - elapsed) : duration
  );

  useEffect(() => {
    void playbackTimePreference.load();
  }, []);

  const cacheValue =
    Math.max(0, Math.min(1, downloadProgress?.percent ?? 0)) * (progressObj?.duration ?? 0);

  const progress = useSharedValue(progressObj?.elapsed ?? 0);
  const min = useSharedValue(0);
  const max = useSharedValue(progressObj?.duration ?? 0);
  const cache = useSharedValue(cacheValue);
  const isScrubbing = useSharedValue(false);
  const pendingSeekRef = useRef<{ value: number; startedAt: number } | null>(null);

  const doSeek = useCallback(
    (value: number) => {
      if (duration <= 0) {
        return;
      }

      value = Math.max(0, Math.min(duration, value));
      progress.value = value;
      pendingSeekRef.current = { value, startedAt: Date.now() };
      void player.seekTo(value / duration);
    },
    [duration, player, progress]
  );

  useEffect(() => {
    if (!isScrubbing.value) {
      const pendingSeek = pendingSeekRef.current;
      if (pendingSeek) {
        const elapsed = progressObj?.elapsed;
        if (elapsed === undefined) {
          return;
        }
        const elapsedDelta = Math.abs(elapsed - pendingSeek.value);
        const elapsedMs = Date.now() - pendingSeek.startedAt;
        const maxPendingMs = isCasting ? 10000 : 3000;
        if (elapsedDelta <= 1 || elapsedMs > maxPendingMs) {
          pendingSeekRef.current = null;
        } else {
          return;
        }
      }
      progress.value = progressObj?.elapsed ?? 0;
    }
  }, [progressObj?.elapsed, isScrubbing.value]);

  useEffect(() => {
    max.value = progressObj?.duration ?? 0;
  }, [progressObj?.duration]);

  useEffect(() => {
    cache.value = cacheValue;
  }, [cacheValue]);

  // Touch cancellation must release the list lock too; the slider's pan
  // onSlidingComplete callback alone does not cover interrupted gestures.
  useEffect(() => () => onScrubbingChange?.(false), [onScrubbingChange]);

  return (
    <Flex column>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        accessibilityValue={{
          min: 0,
          max: duration,
          now: elapsed,
          text: `${trackDuration(elapsed)} of ${trackDuration(duration)}`,
        }}
        accessibilityState={{ disabled: duration <= 0 }}
        accessibilityHint="Swipe up or down to seek by 15 seconds."
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'increment') doSeek(elapsed + 15);
          if (nativeEvent.actionName === 'decrement') doSeek(elapsed - 15);
        }}
        onTouchStart={() => onScrubbingChange?.(true)}
        onTouchEnd={() => onScrubbingChange?.(false)}
        onTouchCancel={() => onScrubbingChange?.(false)}
      >
        {/* The parent owns VoiceOver seeking; the visual slider keeps touch gestures. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Slider
            progress={progress}
            minimumValue={min}
            maximumValue={max}
            cache={cache}
            isScrubbing={isScrubbing}
            hapticMode={HapticModeEnum.BOTH}
            onHapticFeedback={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            onSlidingComplete={doSeek}
            theme={{
              minimumTrackTintColor: RelistenBlue['400'],
              maximumTrackTintColor: subduedCache ? 'rgba(255, 255, 255, 0.52)' : undefined,
              cacheTrackTintColor: subduedCache ? 'rgba(255, 255, 255, 0.52)' : RelistenBlue['600'],
              bubbleBackgroundColor: RelistenBlue['900'],
            }}
            bubble={(value) => trackDuration(value)}
            bubbleTextStyle={{
              fontVariant: ['tabular-nums'],
              textAlign: 'center',
            }}
          />
        </View>
      </View>
      {showTimes && (
        <Flex className="min-h-[44px] items-center justify-between">
          <Text
            className="font-semibold leading-5 text-gray-300 tabular-nums"
            maxFontSizeMultiplier={1.8}
            selectable={false}
          >
            {trackDuration(elapsed)}
          </Text>
          <Pressable
            onPress={playbackTimePreference.toggle}
            accessibilityRole="button"
            accessibilityLabel={timeDisplay === 'remaining' ? 'Remaining time' : 'Total duration'}
            accessibilityValue={{ text: displayedTime }}
            accessibilityHint={`Switch to ${timeDisplay === 'remaining' ? 'total duration' : 'remaining time'}.`}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <Text
              className="font-semibold leading-5 text-gray-300 tabular-nums"
              maxFontSizeMultiplier={1.8}
              selectable={false}
            >
              {timeDisplay === 'remaining' ? '-' : ''}
              {displayedTime}
            </Text>
          </Pressable>
        </Flex>
      )}
    </Flex>
  );
}
