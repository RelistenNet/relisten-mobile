function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

// Centered gain uses half the travel for cuts and half for boosts, preserving
// the existing -30 dB range without requiring an equally large positive boost.
export function decibelsToSliderPosition(
  value: number,
  minimum: number,
  maximum: number,
  centered = false
) {
  const db = clamp(value, minimum, maximum);
  if (centered) return db < 0 ? 0.5 * (1 - db / minimum) : 0.5 + (0.5 * db) / maximum;
  return (db - minimum) / (maximum - minimum);
}

export function sliderPositionToDecibels(
  value: number,
  minimum: number,
  maximum: number,
  centered = false
) {
  const position = clamp(value, 0, 1);
  if (centered) {
    return Math.round(position < 0.5 ? minimum * (1 - position * 2) : maximum * (position * 2 - 1));
  }
  return Math.round(minimum + position * (maximum - minimum));
}
