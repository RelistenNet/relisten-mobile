import Flex from '@/relisten/components/flex';
import {
  useNativeActiveTrackDownloadProgress,
  useNativePlaybackProgress,
} from '@/relisten/player/native_playback_state_hooks';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { sharedStates } from '@/relisten/player/shared_state';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import { trackDuration } from '@/relisten/util/duration';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef } from 'react';
import { Text, useWindowDimensions } from 'react-native';
import { HapticModeEnum, Slider } from 'react-native-awesome-slider';
import { useSharedValue } from 'react-native-reanimated';
import { useRelistenCastStatus } from '@/relisten/casting/cast_ui';

type ScrubberRowProps = {
  showTimes?: boolean;
  subduedCache?: boolean;
};

export function ScrubberRow({ showTimes = true, subduedCache = false }: ScrubberRowProps) {
  'use no memo';

  const progressObj = useNativePlaybackProgress();
  const downloadProgress = useNativeActiveTrackDownloadProgress();
  const player = useRelistenPlayer();
  const { isCasting } = useRelistenCastStatus();
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);

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
      if (progressObj?.duration === undefined) {
        return;
      }

      progress.value = value;
      pendingSeekRef.current = { value, startedAt: Date.now() };
      if (isCasting) {
        sharedStates.progress.setState({
          elapsed: value,
          duration: progressObj.duration,
          percent: progressObj.duration ? value / progressObj.duration : 0,
        });
      }
      player.seekTo(value / progressObj.duration).then(() => {});
    },
    [isCasting, player, progress, progressObj?.duration]
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

  return (
    <Flex column>
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
        bubbleTextStyle={{ fontVariant: ['tabular-nums'], textAlign: 'center' }}
      />
      {showTimes && (
        <Flex className="mt-2 justify-between" style={{ minHeight: 20 * controlScale }}>
          <Text
            className="font-semibold text-gray-300"
            maxFontSizeMultiplier={1.8}
            selectable={false}
            style={{ fontVariant: ['tabular-nums'], lineHeight: 20 * controlScale }}
          >
            {trackDuration(progressObj?.elapsed ?? 0)}
          </Text>
          <Text
            className="font-semibold text-gray-300"
            maxFontSizeMultiplier={1.8}
            selectable={false}
            style={{ fontVariant: ['tabular-nums'], lineHeight: 20 * controlScale }}
          >
            {trackDuration(progressObj?.duration ?? 0)}
          </Text>
        </Flex>
      )}
    </Flex>
  );
}
