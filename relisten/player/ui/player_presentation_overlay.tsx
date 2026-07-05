import { useIsPlayerBottomBarVisible } from '@/relisten/player/ui/player_bar_layout';
import {
  playerPresentationProgress,
  usePlayerPresentation,
} from '@/relisten/player/ui/player_presentation';
import { PlayerScreen } from '@/relisten/player/ui/player_screen';
import { RelistenNavigationProvider } from '@/relisten/util/routes';
import { usePathname } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';
import {
  usePlayerBarPlacementOffset,
  useRelistenPlayerBottomBarContext,
} from '@/relisten/player/ui/player_bar_layout';

export function PlayerPresentationOverlay() {
  const { height } = useWindowDimensions();
  const pathname = usePathname();
  const { playerBottomBarHeight } = useRelistenPlayerBottomBarContext();
  const placementOffset = usePlayerBarPlacementOffset();
  const isPlayerVisible = useIsPlayerBottomBarVisible();
  const { closePlayer, isPresentationActive, isPresentationMounted, resetPlayerPresentation } =
    usePlayerPresentation();
  const handleClose = useCallback(() => closePlayer(), [closePlayer]);
  const collapsedTop = Math.max(height - playerBottomBarHeight - placementOffset, 0);
  const isCoveredByRoute =
    pathname.startsWith('/relisten/audio-adjustments') ||
    pathname.startsWith('/relisten/player-history');
  const isInteractive = isPresentationActive && !isCoveredByRoute;

  useEffect(() => {
    if (!isPlayerVisible) {
      resetPlayerPresentation();
    }
  }, [isPlayerVisible, resetPlayerPresentation]);

  const overlayStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(
      playerPresentationProgress.value,
      [0, 0.4, 1],
      [24, 14, 0],
      Extrapolation.CLAMP
    ),
    opacity: interpolate(
      playerPresentationProgress.value,
      [0, 0.1, 0.28],
      [0, 0.7, 1],
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
      accessibilityElementsHidden={!isInteractive}
      accessibilityViewIsModal={isInteractive}
      onAccessibilityEscape={handleClose}
      pointerEvents={isInteractive ? 'auto' : 'none'}
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: '#001b21',
          boxShadow: '0 -12px 36px rgba(0, 0, 0, 0.34)',
          overflow: 'hidden',
          transformOrigin: 'bottom center',
          zIndex: 1000,
        },
        overlayStyle,
      ]}
    >
      {isPresentationMounted && (
        <RelistenNavigationProvider groupSegment="(artists)">
          <PlayerScreen onClose={handleClose} variant="overlay" />
        </RelistenNavigationProvider>
      )}
    </Animated.View>
  );
}
