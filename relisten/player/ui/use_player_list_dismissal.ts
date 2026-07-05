import {
  playerDismissGestureDistance,
  shouldFinishPlayerDismiss,
} from '@/relisten/player/ui/player_dismissal';
import {
  playerPresentationProgress,
  usePlayerPresentation,
} from '@/relisten/player/ui/player_presentation';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import { cancelAnimation, useSharedValue } from 'react-native-reanimated';

const TOP_BOUNDARY_TOLERANCE = 1;

export function usePlayerListDismissal(enabled: boolean) {
  const { height } = useWindowDimensions();
  const { beginInteractivePresentation, closePlayer, openPlayer } = usePlayerPresentation();
  const isDismissalDragArmed = useSharedValue(false);
  const gestureStartProgress = useSharedValue(1);
  const gestureDistance = playerDismissGestureDistance(height);

  const onScrollBeginDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const startsAtTop = event.nativeEvent.contentOffset.y <= TOP_BOUNDARY_TOLERANCE;
    isDismissalDragArmed.value = enabled && startsAtTop;

    if (isDismissalDragArmed.value) {
      gestureStartProgress.value = playerPresentationProgress.value;
      beginInteractivePresentation();
    }
  };

  const updateDismissalProgress = (rawOffset: number) => {
    'worklet';
    if (!isDismissalDragArmed.value) return;

    if (rawOffset >= 0) {
      if (playerPresentationProgress.value < gestureStartProgress.value) {
        playerPresentationProgress.value = gestureStartProgress.value;
      }
      return;
    }

    cancelAnimation(playerPresentationProgress);
    playerPresentationProgress.value = Math.max(
      0,
      Math.min(1, gestureStartProgress.value + rawOffset / gestureDistance)
    );
  };

  const onScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const wasArmed = isDismissalDragArmed.value;
    isDismissalDragArmed.value = false;
    if (!wasArmed) return;

    const rawOffset = event.nativeEvent.contentOffset.y;
    const nativeScrollVelocity = event.nativeEvent.velocity?.y ?? 0;
    const downwardVelocity = -nativeScrollVelocity * 1000;
    const shouldDismiss =
      rawOffset < 0 &&
      shouldFinishPlayerDismiss(
        playerPresentationProgress.value,
        downwardVelocity,
        gestureDistance
      );

    if (shouldDismiss) {
      closePlayer();
    } else if (playerPresentationProgress.value < 1) {
      openPlayer();
    }
  };

  return {
    onScrollBeginDrag,
    onScrollEndDrag,
    updateDismissalProgress,
  };
}
