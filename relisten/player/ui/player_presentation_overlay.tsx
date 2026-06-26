import { useIsPlayerBottomBarVisible } from '@/relisten/player/ui/player_bar_layout';
import {
  playerPresentationProgress,
  usePlayerPresentation,
} from '@/relisten/player/ui/player_presentation';
import { PlayerScreen } from '@/relisten/player/ui/player_screen';
import { RelistenNavigationProvider } from '@/relisten/util/routes';
import { useEffect } from 'react';
import { BackHandler, useWindowDimensions } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';
import {
  usePlayerBarPlacementOffset,
  useRelistenPlayerBottomBarContext,
} from '@/relisten/player/ui/player_bar_layout';

export function PlayerPresentationOverlay() {
  const { height } = useWindowDimensions();
  const { playerBottomBarHeight } = useRelistenPlayerBottomBarContext();
  const placementOffset = usePlayerBarPlacementOffset();
  const isPlayerVisible = useIsPlayerBottomBarVisible();
  const { closePlayer, isPresentationActive, isPresentationMounted, resetPlayerPresentation } =
    usePlayerPresentation();
  const collapsedTop = Math.max(height - playerBottomBarHeight - placementOffset, 0);

  useEffect(() => {
    if (!isPlayerVisible) {
      resetPlayerPresentation();
    }
  }, [isPlayerVisible, resetPlayerPresentation]);

  useEffect(() => {
    if (!isPresentationActive) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closePlayer();
      return true;
    });

    return () => subscription.remove();
  }, [closePlayer, isPresentationActive]);

  const overlayStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(
      playerPresentationProgress.value,
      [0, 0.4, 1],
      [24, 14, 0],
      Extrapolation.CLAMP
    ),
    opacity: interpolate(
      playerPresentationProgress.value,
      [0, 0.008, 0.08],
      [0, 0.9, 1],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        translateY: interpolate(
          playerPresentationProgress.value,
          [0, 1],
          [collapsedTop, 0],
          Extrapolation.CLAMP
        ),
      },
      {
        scaleX: interpolate(
          playerPresentationProgress.value,
          [0, 0.35, 1],
          [0.94, 0.985, 1],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  if (!isPlayerVisible) {
    return null;
  }

  return (
    <Animated.View
      accessibilityElementsHidden={!isPresentationActive}
      accessibilityViewIsModal={isPresentationActive}
      pointerEvents={isPresentationActive ? 'auto' : 'none'}
      style={[
        {
          backgroundColor: '#001b21',
          bottom: 0,
          boxShadow: '0 -12px 36px rgba(0, 0, 0, 0.34)',
          left: 0,
          overflow: 'hidden',
          position: 'absolute',
          right: 0,
          top: 0,
          transformOrigin: 'bottom center',
          zIndex: 1000,
        },
        overlayStyle,
      ]}
    >
      {isPresentationMounted && (
        <RelistenNavigationProvider groupSegment="(artists)">
          <PlayerScreen onClose={closePlayer} variant="overlay" />
        </RelistenNavigationProvider>
      )}
    </Animated.View>
  );
}
