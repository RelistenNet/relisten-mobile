import {
  PLAYER_DISMISS_ACTIVATION_DISTANCE,
  playerDismissGestureDistance,
  shouldFinishPlayerDismiss,
} from '@/relisten/player/ui/player_dismissal';
import {
  playerPresentationProgress,
  usePlayerPresentation,
} from '@/relisten/player/ui/player_presentation';
import { useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

export function PlayerOverlayHeader({ interactive }: { interactive: boolean }) {
  'use no memo';

  const { height } = useWindowDimensions();
  const { beginInteractivePresentation, closePlayer, openPlayer } = usePlayerPresentation();
  const touchStartY = useSharedValue(0);
  const gestureStartProgress = useSharedValue(1);
  const gestureDistance = playerDismissGestureDistance(height);

  const collapseGesture = Gesture.Pan()
    .enabled(interactive)
    .manualActivation(true)
    .onTouchesDown((event) => {
      touchStartY.value = event.allTouches[0]?.absoluteY ?? 0;
    })
    .onTouchesMove((event, stateManager) => {
      const currentY = event.allTouches[0]?.absoluteY;
      if (currentY === undefined) return;

      const translationY = currentY - touchStartY.value;
      if (translationY < -PLAYER_DISMISS_ACTIVATION_DISTANCE) {
        stateManager.fail();
      } else if (translationY > PLAYER_DISMISS_ACTIVATION_DISTANCE) {
        stateManager.activate();
      }
    })
    .onStart(() => {
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
      if (
        shouldFinishPlayerDismiss(
          playerPresentationProgress.value,
          event.velocityY,
          gestureDistance
        )
      ) {
        runOnJS(closePlayer)();
      } else {
        runOnJS(openPlayer)();
      }
    })
    .onFinalize((_event, success) => {
      if (!success && playerPresentationProgress.value < 1) {
        runOnJS(openPlayer)();
      }
    });

  return (
    <GestureDetector gesture={collapseGesture}>
      <View
        accessibilityElementsHidden
        className="min-h-11 items-center justify-center"
        importantForAccessibility="no-hide-descendants"
      >
        <View className="h-1 w-9 rounded-full bg-relisten-blue-200/80" />
      </View>
    </GestureDetector>
  );
}
