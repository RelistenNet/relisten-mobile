import {
  cloneElement,
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { Animated, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

type StickyHeaderChildProps = {
  item?: { kind?: string; id?: string };
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
};

type PlayerTimelineStickyHeaderProps = {
  children: ReactElement<StickyHeaderChildProps>;
  nativeID?: string;
  nextHeaderLayoutY?: number | null;
  onLayout: (event: LayoutChangeEvent) => void;
  scrollAnimatedValue: Animated.Value;
};

type StickyHeaderHandle = {
  setNextHeaderY: (value: number) => void;
};

type PlayerTimelineStickyHeaderLayout = {
  height: number;
  y: number;
};

const QueueHeaderInsetContext = createContext(0);

const NowPlayingStickyLayoutContext = createContext<
  ((layout: PlayerTimelineStickyHeaderLayout) => void) | undefined
>(undefined);

export function PlayerTimelineStickyHeaderProvider({
  children,
  onNowPlayingLayout,
  queueHeaderInset,
}: {
  children: ReactElement;
  queueHeaderInset: number;
  onNowPlayingLayout: (layout: PlayerTimelineStickyHeaderLayout) => void;
}) {
  return (
    <NowPlayingStickyLayoutContext.Provider value={onNowPlayingLayout}>
      <QueueHeaderInsetContext.Provider value={queueHeaderInset}>
        {children}
      </QueueHeaderInsetContext.Provider>
    </NowPlayingStickyLayoutContext.Provider>
  );
}

// ScrollView supplies a React Native Animated value for its native sticky-header path.
// Keeping the pinning transform in that same path avoids frame skew with native scrolling.
export const PlayerTimelineStickyHeader = forwardRef<
  StickyHeaderHandle,
  PlayerTimelineStickyHeaderProps
>(function PlayerTimelineStickyHeader(
  {
    children,
    nativeID,
    nextHeaderLayoutY: initialNextHeaderLayoutY,
    onLayout,
    scrollAnimatedValue,
  },
  ref
) {
  const [layout, setLayout] = useState<{ height: number; y: number }>();
  const [nextHeaderLayoutY, setNextHeaderLayoutY] = useState(initialNextHeaderLayoutY);
  const isNowPlaying = children.props.item?.kind === 'now-playing';
  const onNowPlayingLayout = useContext(NowPlayingStickyLayoutContext);
  const queueHeaderInset = useContext(QueueHeaderInsetContext);
  const inset = children.props.item?.id === 'up-next' ? queueHeaderInset : 0;

  useImperativeHandle(ref, () => ({ setNextHeaderY: setNextHeaderLayoutY }), []);

  const translateY = useMemo(() => {
    // Keep the wrapper for its absolute content measurement, but never pin the
    // player behind queue rows. Its actual position now matches hit testing and
    // accessibility, including the empty space left by a lifted queue row.
    if (!layout || isNowPlaying) {
      return scrollAnimatedValue.interpolate({
        inputRange: [-1, 0],
        outputRange: [0, 0],
      });
    }

    const start = Math.max(0, layout.y - inset);
    const inputRange = [-1, 0, start, start + 1];
    const outputRange = [0, 0, 0, 1];

    const collisionPoint = (nextHeaderLayoutY ?? 0) - layout.height - inset;
    if (collisionPoint >= start + 1) {
      inputRange.push(collisionPoint, collisionPoint + 1);
      outputRange.push(collisionPoint - start, collisionPoint - start);
    }

    return scrollAnimatedValue.interpolate({ inputRange, outputRange });
  }, [inset, isNowPlaying, layout, nextHeaderLayoutY, scrollAnimatedValue]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height, y } = event.nativeEvent.layout;
      setLayout((current) =>
        current?.height === height && current.y === y ? current : { height, y }
      );
      if (isNowPlaying) onNowPlayingLayout?.({ height, y });
      onLayout(event);
      children.props.onLayout?.(event);
    },
    [children.props, isNowPlaying, onLayout, onNowPlayingLayout]
  );

  return (
    <Animated.View
      collapsable={false}
      nativeID={nativeID}
      onLayout={handleLayout}
      style={[children.props.style, { transform: [{ translateY }], zIndex: isNowPlaying ? 0 : 10 }]}
    >
      {cloneElement(children, { onLayout: undefined, style: { flex: 1 } })}
    </Animated.View>
  );
});
