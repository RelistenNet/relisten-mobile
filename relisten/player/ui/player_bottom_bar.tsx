import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import {
  useRelistenPlayer,
  useRelistenPlayerPlaybackState,
} from '@/relisten/player/relisten_player_hooks';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import { useNativePlaybackProgress } from '@/relisten/player/native_playback_state_hooks';
import {
  playerPresentationProgress,
  usePlayerPresentation,
} from '@/relisten/player/ui/player_presentation';
import { MaterialIcons } from '@expo/vector-icons';
import { useCallback } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { ScrubberRow } from './player_scrubber';
import * as Progress from 'react-native-progress';
import AirPlayButton from 'react-native-airplay-button';
import {
  RelistenCastButton,
  useShouldRenderCastButton,
  useRelistenCastStatus,
} from '@/relisten/casting/cast_ui';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import {
  useIsPlayerBottomBarVisible,
  PlayerBarPlacementBackend,
  usePlayerBarPlacementOffset,
  useRelistenPlayerBottomBarContext,
} from './player_bar_layout';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

const EXPANSION_ACTIVATION_DISTANCE = 2;
const EXPANSION_PROJECTION_SECONDS = 0.18;

function OfflineBanner() {
  return (
    <View className="flex flex-row items-center justify-center bg-red-900/85 px-3 py-2">
      <View className="mr-1">
        <MaterialIcons name="cloud-off" size={20} color="white" />
      </View>
      <RelistenText className="text-sm text-white">
        Offline. You can stream downloaded tracks
      </RelistenText>
    </View>
  );
}

interface PlayerBottomBarContentsProps {
  placementBackend: PlayerBarPlacementBackend;
}

function NativeTabsAccessoryProgress() {
  const progress = useNativePlaybackProgress();
  const percent =
    progress?.duration && progress.duration > 0
      ? Math.max(0, Math.min(1, progress.elapsed / progress.duration))
      : 0;

  return (
    <View className="mx-1.5 h-[3px] overflow-hidden rounded-full bg-slate-400/20">
      <View
        className="h-full rounded-full bg-cyan-400"
        style={{ width: `${percent * 100}%`, opacity: percent < 0.01 ? 0 : 1 }}
      />
    </View>
  );
}

function PlayerBottomBarProgress({
  placementBackend,
}: {
  placementBackend: PlayerBarPlacementBackend;
}) {
  return placementBackend === 'nativeTabsAccessory' ? (
    <NativeTabsAccessoryProgress />
  ) : (
    <View className="mx-0.5 overflow-hidden rounded-full bg-slate-400/10 px-1.5 py-0.5">
      <ScrubberRow showTimes={false} />
    </View>
  );
}

function PlayerBottomBarContents({ placementBackend }: PlayerBottomBarContentsProps) {
  'use no memo';

  const currentTrack = useRelistenPlayerCurrentTrack();
  const playbackState = useRelistenPlayerPlaybackState();
  const player = useRelistenPlayer();
  const { height } = useWindowDimensions();
  const { beginInteractivePresentation, closePlayer, openPlayer } = usePlayerPresentation();
  const { isCasting, deviceName } = useRelistenCastStatus();
  const shouldRenderCastButton = useShouldRenderCastButton();
  const gesturePresentationStarted = useSharedValue(false);
  const gestureStartProgress = useSharedValue(0);
  const gestureDistance = Math.max(height * 0.72, 1);

  if (!currentTrack) {
    return <></>;
  }

  const track = currentTrack.sourceTrack;
  const isAccessory = placementBackend === 'nativeTabsAccessory';
  const playbackIconSize = isAccessory ? 26 : 30;
  const utilityIconClassName = isAccessory ? 'h-[18] w-[18]' : 'h-[20] w-[20]';
  const rootContainerCn = isAccessory ? '' : 'flex-1';
  const headerRowCn = isAccessory ? 'min-h-[38px] items-center' : 'items-center';
  const titleClassName = isAccessory
    ? 'text-[15px] font-semibold text-white'
    : 'text-base font-semibold text-white';
  const subtitleClassName = isAccessory ? 'text-xs text-slate-200' : 'text-sm text-slate-200';
  const castingClassName = isAccessory ? 'text-[11px] text-slate-300' : 'text-xs text-slate-300';
  const transportButtonClassName = isAccessory
    ? 'h-9 w-9 items-center justify-center rounded-full bg-white/15'
    : 'h-11 w-11 items-center justify-center rounded-full bg-white/10';
  const utilityButtonShellClassName = isAccessory
    ? 'ml-1.5 h-[30px] w-[30px] items-center justify-center rounded-full bg-white/10'
    : 'ml-2 h-9 w-9 items-center justify-center rounded-full bg-white/10';

  let playbackStateIcon = <MaterialIcons name="play-arrow" size={playbackIconSize} color="white" />;

  if (playbackState == RelistenPlaybackState.Playing) {
    playbackStateIcon = <MaterialIcons name="pause" size={playbackIconSize} color="white" />;
  } else if (playbackState == RelistenPlaybackState.Stalled) {
    playbackStateIcon = (
      <Progress.CircleSnail indeterminate={true} size={isAccessory ? 22 : 28} color="white" />
    );
  }

  const expandGesture = Gesture.Pan()
    .activeOffsetY(-EXPANSION_ACTIVATION_DISTANCE)
    .failOffsetX([-24, 24])
    .failOffsetY(EXPANSION_ACTIVATION_DISTANCE)
    .onBegin(() => {
      gesturePresentationStarted.value = false;
    })
    .onStart(() => {
      gesturePresentationStarted.value = true;
      gestureStartProgress.value = playerPresentationProgress.value;
      runOnJS(beginInteractivePresentation)();
    })
    .onUpdate((event) => {
      playerPresentationProgress.value = Math.max(
        0,
        Math.min(1, gestureStartProgress.value - event.translationY / gestureDistance)
      );
    })
    .onEnd((event) => {
      const projectedProgress =
        playerPresentationProgress.value -
        (event.velocityY * EXPANSION_PROJECTION_SECONDS) / gestureDistance;

      if (projectedProgress > 0.32) {
        runOnJS(openPlayer)();
      } else {
        runOnJS(closePlayer)();
      }
    })
    .onFinalize((_event, success) => {
      if (success || !gesturePresentationStarted.value) return;

      if (playerPresentationProgress.value > 0.32) {
        runOnJS(openPlayer)();
      } else {
        runOnJS(closePlayer)();
      }
    });
  const openGesture = Gesture.Tap().onEnd((_event, success) => {
    if (success) runOnJS(openPlayer)();
  });
  const metadataGesture = Gesture.Exclusive(expandGesture, openGesture);

  return (
    <Flex column cn={rootContainerCn}>
      <Flex cn={headerRowCn}>
        <TouchableOpacity
          className={transportButtonClassName}
          onPress={() => {
            player.togglePauseResume();
          }}
        >
          {playbackStateIcon}
        </TouchableOpacity>
        <GestureDetector gesture={metadataGesture}>
          <Animated.View
            accessible
            accessibilityLabel={`Open player for ${track.title}`}
            accessibilityRole="button"
            className={`${isAccessory ? 'ml-2' : 'ml-3'} min-w-0 flex-1`}
            onAccessibilityTap={openPlayer}
          >
            <Flex column cn="flex-1 min-w-0">
              <RelistenText className={titleClassName} numberOfLines={1}>
                {track?.title ?? ''}
              </RelistenText>
              <RelistenText className={subtitleClassName} numberOfLines={1}>
                {currentTrack.subtitle ?? ''}
              </RelistenText>
              {isCasting && (
                <RelistenText className={castingClassName} numberOfLines={1}>
                  Casting{deviceName ? ` to ${deviceName}` : ''}
                </RelistenText>
              )}
            </Flex>
          </Animated.View>
        </GestureDetector>
        <Flex cn={isAccessory ? 'ml-2 items-center self-center' : 'ml-2 items-center'}>
          {Platform.OS === 'ios' && (
            <View className={utilityButtonShellClassName}>
              <AirPlayButton
                activeTintColor="white"
                tintColor="rgba(226, 232, 240, 0.72)"
                prioritizesVideoDevices={false}
                className={utilityIconClassName}
              />
            </View>
          )}
          {shouldRenderCastButton && (
            <View className={utilityButtonShellClassName}>
              <RelistenCastButton
                tintColor="rgba(226, 232, 240, 0.78)"
                className={utilityIconClassName}
              />
            </View>
          )}
        </Flex>
      </Flex>
      <PlayerBottomBarProgress placementBackend={placementBackend} />
    </Flex>
  );
}

interface PlayerBottomBarProps {
  placementBackend?: PlayerBarPlacementBackend;
}

const OFFLINE_OVERLAY_MIN_HEIGHT = 104;
const OFFLINE_ACCESSORY_MIN_HEIGHT = 96;

export function PlayerBottomBar({ placementBackend = 'overlay' }: PlayerBottomBarProps) {
  'use no memo';

  const isOnline = useShouldMakeNetworkRequests();
  const { playerBottomBarHeight, setPlayerBottomBarHeight } = useRelistenPlayerBottomBarContext();
  const placementOffset = usePlayerBarPlacementOffset();
  const { isPresentationActive } = usePlayerPresentation();
  const offlineMinHeight = !isOnline
    ? placementBackend === 'overlay'
      ? OFFLINE_OVERLAY_MIN_HEIGHT
      : OFFLINE_ACCESSORY_MIN_HEIGHT
    : undefined;

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { height } = e.nativeEvent.layout;
      if (playerBottomBarHeight != height) {
        setPlayerBottomBarHeight(height);
      }
    },
    [playerBottomBarHeight, setPlayerBottomBarHeight]
  );

  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      playerPresentationProgress.value,
      [0, 0.025, 0.14],
      [1, 0.6, 0],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        translateY: interpolate(
          playerPresentationProgress.value,
          [0, 1],
          [0, Math.min(playerBottomBarHeight * 0.38, 24)],
          Extrapolation.CLAMP
        ),
      },
      {
        scale: interpolate(
          playerPresentationProgress.value,
          [0, 1],
          [1, 0.96],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const isVisible = useIsPlayerBottomBarVisible();

  if (!isVisible) {
    return <></>;
  }

  const isOverlay = placementBackend === 'overlay';
  const containerClassName = isOverlay ? 'absolute w-full' : 'w-full';
  const contentContainerClassName = isOverlay ? 'w-full flex-1 px-3 pb-2' : 'w-full px-1.5';
  const mainSurfaceClassName = isOverlay ? 'px-3 pb-3 pt-2.5' : 'pb-2 pt-1.5';
  const shellChromeStyle =
    Platform.OS === 'ios'
      ? { boxShadow: '0 10px 22px rgba(2, 6, 23, 0.22)' }
      : { elevation: 10, shadowColor: '#020617' };
  const shellSurfaceClassName = `overflow-hidden rounded-3xl border bg-[rgba(8,18,31,0.95)] ${
    Platform.OS === 'ios' ? 'border-white/15' : 'border-white/10'
  }`;
  const body = (
    <>
      {!isOnline && <OfflineBanner />}
      <View className={mainSurfaceClassName}>
        <PlayerBottomBarContents placementBackend={placementBackend} />
      </View>
    </>
  );

  return (
    <Animated.View
      className={containerClassName}
      onLayout={onLayout}
      pointerEvents={isPresentationActive ? 'none' : 'auto'}
      style={[
        { bottom: isOverlay ? placementOffset : undefined, minHeight: offlineMinHeight },
        barStyle,
      ]}
    >
      <View className={contentContainerClassName}>
        {isOverlay ? (
          <View className="rounded-3xl" style={shellChromeStyle}>
            <View className={shellSurfaceClassName}>{body}</View>
          </View>
        ) : (
          body
        )}
      </View>
    </Animated.View>
  );
}
