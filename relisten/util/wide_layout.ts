import { useWindowDimensions } from 'react-native';

/**
 * Window widths where side panes join the content. Layout follows the window,
 * never the device: Stage Manager, Split View, and Mac windows resize at
 * runtime, and an iPad window can be narrower than a phone.
 *
 * - The library sidebar needs 800pt, so an 11" iPad shows it in portrait
 *   (820pt) and landscape; an iPad mini in portrait (744pt) does not.
 * - The player rail also needs room for the sidebar and readable content, so
 *   it waits for 1100pt: an 11" iPad in landscape (1180pt), not portrait.
 */
export const SIDEBAR_LAYOUT_MIN_WIDTH = 800;
export const WIDE_LAYOUT_MIN_WIDTH = 1100;

export function isWideLayoutWidth(width: number) {
  return width >= WIDE_LAYOUT_MIN_WIDTH;
}

/** Wide enough for the player rail beside the content. */
export function useIsWideLayout() {
  const { width } = useWindowDimensions();

  return isWideLayoutWidth(width);
}

/** Wide enough for the library sidebar beside the content. */
export function useIsSidebarLayout() {
  const { width } = useWindowDimensions();

  return width >= SIDEBAR_LAYOUT_MIN_WIDTH;
}
