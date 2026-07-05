export const PLAYER_DISMISS_ACTIVATION_DISTANCE = 10;
export const PLAYER_DISMISS_PROJECTION_SECONDS = 0.18;

export function playerDismissGestureDistance(screenHeight: number) {
  return Math.max(screenHeight * 0.72, 1);
}

export function shouldFinishPlayerDismiss(
  progress: number,
  downwardVelocity: number,
  gestureDistance: number
) {
  'worklet';
  const projectedProgress =
    progress - (downwardVelocity * PLAYER_DISMISS_PROJECTION_SECONDS) / gestureDistance;
  return projectedProgress <= 0.55;
}
