import { type PropsWithChildren, useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const SIDE_PANE_ANIMATION = { duration: 240, easing: Easing.out(Easing.cubic) } as const;

/**
 * A pane beside the content in a wide window that slides between two widths.
 * Its children stay mounted and laid out at the open width the whole time,
 * so showing it again does not rebuild or re-measure them; the frame only
 * clips them. `edge` is the window edge the pane sits against.
 */
export function SidePane({
  children,
  edge,
  openWidth,
  closedWidth = 0,
  open,
}: PropsWithChildren<{
  edge: 'leading' | 'trailing';
  openWidth: number;
  closedWidth?: number;
  open: boolean;
}>) {
  const width = useSharedValue(open ? openWidth : closedWidth);

  useEffect(() => {
    width.set(withTiming(open ? openWidth : closedWidth, SIDE_PANE_ANIMATION));
  }, [closedWidth, open, openWidth, width]);

  const frameStyle = useAnimatedStyle(() => ({ width: width.value }));

  return (
    <Animated.View
      accessibilityElementsHidden={!open && closedWidth === 0}
      importantForAccessibility={!open && closedWidth === 0 ? 'no-hide-descendants' : 'auto'}
      pointerEvents={!open && closedWidth === 0 ? 'none' : 'auto'}
      style={[{ overflow: 'hidden' }, frameStyle]}
    >
      <Animated.View
        style={[
          { position: 'absolute', top: 0, bottom: 0, width: openWidth },
          edge === 'leading' ? { left: 0 } : { right: 0 },
        ]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}
