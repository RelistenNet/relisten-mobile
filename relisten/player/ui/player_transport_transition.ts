/**
 * Couples the scrolling player's two transport views. The incoming controls
 * become usable while both views are still visible; a slow drag must never
 * leave playback controls faded out or owned by the less visible view.
 */
export function playerTransportTransition(progress: number) {
  'worklet';

  const compactOpacity = Math.max(0, Math.min(1, (progress - 0.25) / 0.25));
  const expandedOpacity = Math.max(0, Math.min(1, (0.65 - progress) / 0.25));

  return {
    compactOpacity,
    expandedOpacity,
    compactOwnsControls: compactOpacity >= expandedOpacity,
    // Once compact controls own input, tuck the outgoing utility row under
    // their header instead of leaving fading buttons over the queue.
    expandedClipProgress: Math.max(0, Math.min(1, (progress - 0.45) / 0.05)),
  };
}
