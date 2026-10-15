import {
  PLAYER_DISMISS_ACTIVATION_DISTANCE,
  playerDismissGestureDistance,
  shouldFinishPlayerDismiss,
} from '@/relisten/player/ui/player_dismissal';
import {
  playerPresentationProgress,
  usePlayerPresentation,
} from '@/relisten/player/ui/player_presentation';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

/** Keeps dismissal available above the scrolling player, by button or grabber drag. */
export function PlayerOverlayHeader({ interactive }: { interactive: boolean }) {
  'use no memo';

  const { height } = useWindowDimensions();
  const { beginInteractivePresentation, closePlayer, openPlayer } = usePlayerPresentation();
  const touchStartY = useSharedValue(0);
  const gestureStartProgress = useSharedValue(1);
  const gestureDistance = playerDismissGestureDistance(height);

  // Activate only after downward movement, so tapping the chevron remains a
  // normal button press and an upward drag can pass back to the player list.
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
    .onEnd((event, success) => {
      // onEnd runs only for an activated drag, including cancellation. A tap
      // never activates the pan and must not undo the chevron's close action.
      if (!success) {
        runOnJS(openPlayer)();
        return;
      }
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
    });

  return (
    <GestureDetector gesture={collapseGesture}>
      <View className="min-h-[56px] items-center justify-end pb-2 pt-3" collapsable={false}>
        <TouchableOpacity
          accessibilityLabel="Collapse player"
          accessibilityRole="button"
          accessibilityElementsHidden={!interactive}
          importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
          className="absolute left-3 top-1.5 h-11 w-11 items-center justify-center"
          disabled={!interactive}
          onPress={() => closePlayer()}
        >
          <Ionicons color="rgba(255, 255, 255, 0.8)" name="chevron-down" size={25} />
        </TouchableOpacity>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="h-1 w-9 rounded-full bg-relisten-blue-200/80"
        />
      </View>
    </GestureDetector>
  );
}
