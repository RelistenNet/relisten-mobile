import {
  PLAYER_DISMISS_ACTIVATION_DISTANCE,
  playerDismissGestureDistance,
  shouldFinishPlayerDismiss,
} from './player_dismissal';
import { playerPresentationProgress, usePlayerPresentation } from './player_presentation';
import { useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  runOnJS,
  type SharedValue,
  useSharedValue,
} from 'react-native-reanimated';

/** A downward drag dismisses the player only when its content starts at the top. */
export function usePlayerDismissGesture(enabled: boolean, scrollOffset?: SharedValue<number>) {
  'use no memo';
  const { height } = useWindowDimensions();
  const { beginInteractivePresentation, closePlayer, openPlayer } = usePlayerPresentation();
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startProgress = useSharedValue(1);
  const distance = playerDismissGestureDistance(height);

  return Gesture.Pan()
    .enabled(enabled)
    .manualActivation(true)
    .onTouchesDown((event, manager) => {
      if ((scrollOffset?.value ?? 0) > 1) {
        manager.fail();
        return;
      }
      startX.value = event.allTouches[0]?.absoluteX ?? 0;
      startY.value = event.allTouches[0]?.absoluteY ?? 0;
    })
    .onTouchesMove((event, manager) => {
      const touch = event.allTouches[0];
      if (!touch) return;
      const dy = touch.absoluteY - startY.value;
      const dx = Math.abs(touch.absoluteX - startX.value);
      if (
        (dx > PLAYER_DISMISS_ACTIVATION_DISTANCE && dx > Math.abs(dy)) ||
        dy < -PLAYER_DISMISS_ACTIVATION_DISTANCE
      ) {
        manager.fail();
      } else if (dy > PLAYER_DISMISS_ACTIVATION_DISTANCE) {
        manager.activate();
      }
    })
    .onStart(() => {
      cancelAnimation(playerPresentationProgress);
      startProgress.value = playerPresentationProgress.value;
      runOnJS(beginInteractivePresentation)();
    })
    .onUpdate((event) => {
      playerPresentationProgress.value = Math.max(
        0,
        Math.min(1, startProgress.value - event.translationY / distance)
      );
    })
    .onEnd((event, success) => {
      if (
        success &&
        shouldFinishPlayerDismiss(playerPresentationProgress.value, event.velocityY, distance)
      ) {
        runOnJS(closePlayer)();
      } else {
        runOnJS(openPlayer)();
      }
    });
}
