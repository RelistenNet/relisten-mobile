const MAXIMUM_CONTROL_SCALE = 1.5;

export function accessibleControlScale(fontScale: number) {
  return Math.min(Math.max(fontScale, 1), MAXIMUM_CONTROL_SCALE);
}
