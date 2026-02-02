import { useWindowDimensions } from 'react-native';

export type LayoutMode = 'compact' | 'desktop';

export const DESKTOP_LAYOUT_MIN_WIDTH = 1200;

export const useLayoutMode = (): LayoutMode => {
  const { width } = useWindowDimensions();

  return width >= DESKTOP_LAYOUT_MIN_WIDTH ? 'desktop' : 'compact';
};

export const useIsDesktopLayout = () => useLayoutMode() === 'desktop';
