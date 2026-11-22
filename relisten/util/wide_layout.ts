import { useWindowDimensions } from 'react-native';

/**
 * The narrowest window that keeps the player beside the content. An 11" iPad
 * in landscape (1180pt) qualifies; the same iPad in portrait, Split View, and
 * Slide Over do not.
 *
 * Layout follows the window, never the device: Stage Manager, Split View, and
 * Mac windows resize at runtime, and an iPad window can be narrower than a
 * phone.
 */
export const WIDE_LAYOUT_MIN_WIDTH = 1100;

export function isWideLayoutWidth(width: number) {
  return width >= WIDE_LAYOUT_MIN_WIDTH;
}

export function useIsWideLayout() {
  const { width } = useWindowDimensions();

  return isWideLayoutWidth(width);
}
