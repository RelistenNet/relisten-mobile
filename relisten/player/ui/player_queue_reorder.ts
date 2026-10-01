// A reorder belongs to the exact timeline on which the long press began.
// Playback can advance while the finger is down and replace those indices.
export function isQueueReorderCurrent(
  startedKeys: readonly string[] | null,
  currentKeys: readonly string[]
) {
  return (
    startedKeys !== null &&
    startedKeys.length === currentKeys.length &&
    startedKeys.every((key, index) => key === currentKeys[index])
  );
}
