export type PlayerTimelineLayout = { y: number; height: number };

// Native snapping owns velocity/deceleration. Do not page through a player that
// exceeds the viewport: large text users must be able to reach all its controls.
export function playerTimelineSnapOffsets(
  layout: PlayerTimelineLayout | undefined,
  viewportHeight: number,
  interacting: boolean,
  compactHeight = 0
): number[] | undefined {
  if (!layout || interacting || layout.height <= 0 || layout.height > viewportHeight) {
    return undefined;
  }
  if (layout.height <= compactHeight) return undefined;
  const historyOffset = Math.max(0, layout.y - viewportHeight);
  return [
    ...(layout.y > 0 ? [historyOffset] : []),
    layout.y,
    layout.y + layout.height - compactHeight,
  ];
}

export function playerTimelineFooterHeight(
  viewportHeight: number,
  queueContentHeight: number,
  transportClearance: number
) {
  // Even an empty queue must be able to reach its resting position.
  return Math.max(transportClearance, viewportHeight - queueContentHeight);
}

export function reconciledPlayerTimelineOffset(
  offset: number,
  previous: PlayerTimelineLayout,
  next: PlayerTimelineLayout,
  previousCompactHeight = 0,
  nextCompactHeight = previousCompactHeight
) {
  if (offset < previous.y - 1) return offset;
  const queueHeightDelta =
    offset >= previous.y + previous.height - previousCompactHeight - 1
      ? next.height - previous.height - (nextCompactHeight - previousCompactHeight)
      : 0;
  return Math.max(0, offset + next.y - previous.y + queueHeightDelta);
}
