import {
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactElement,
} from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewInstance,
  type ViewStyle,
} from 'react-native';

type StickyHeaderChildProps = {
  item?: { kind?: string };
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
};

type NativeStickyHeader = NonNullable<ScrollViewProps['StickyHeaderComponent']>;
type PlayerTimelineStickyHeaderProps = ComponentPropsWithoutRef<NativeStickyHeader>;
type StickyHeaderHandle = ComponentRef<NativeStickyHeader>;

type PlayerTimelineStickyHeaderLayout = {
  height: number;
  y: number;
};

const NowPlayingStickyLayoutContext = createContext<
  ((layout: PlayerTimelineStickyHeaderLayout) => void) | undefined
>(undefined);

export function PlayerTimelineStickyHeaderProvider({
  children,
  onNowPlayingLayout,
}: {
  children: ReactElement;
  onNowPlayingLayout: (layout: PlayerTimelineStickyHeaderLayout) => void;
}) {
  return (
    <NowPlayingStickyLayoutContext.Provider value={onNowPlayingLayout}>
      {children}
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
  const headerRef = useRef<ViewInstance>(null);
  const child = isValidElement<StickyHeaderChildProps>(children) ? children : undefined;
  const childProps = child?.props;
  const isNowPlaying = childProps?.item?.kind === 'now-playing';
  const onNowPlayingLayout = useContext(NowPlayingStickyLayoutContext);

  useImperativeHandle(
    ref,
    () => Object.assign(headerRef.current!, { setNextHeaderY: setNextHeaderLayoutY }),
    []
  );

  const translateY = useMemo(() => {
    if (!layout) {
      return scrollAnimatedValue.interpolate({
        inputRange: [-1, 0],
        outputRange: [0, 0],
      });
    }

    const inputRange = [-1, 0, layout.y, layout.y + 1];
    const outputRange = [0, 0, 0, 1];

    if (!isNowPlaying) {
      const collisionPoint = (nextHeaderLayoutY ?? 0) - layout.height;
      if (collisionPoint >= layout.y + 1) {
        inputRange.push(collisionPoint, collisionPoint + 1);
        outputRange.push(collisionPoint - layout.y, collisionPoint - layout.y);
      }
    }

    return scrollAnimatedValue.interpolate({ inputRange, outputRange });
  }, [isNowPlaying, layout, nextHeaderLayoutY, scrollAnimatedValue]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height, y } = event.nativeEvent.layout;
      setLayout((current) =>
        current?.height === height && current.y === y ? current : { height, y }
      );
      if (isNowPlaying) onNowPlayingLayout?.({ height, y });
      onLayout(event);
      childProps?.onLayout?.(event);
    },
    [childProps, isNowPlaying, onLayout, onNowPlayingLayout]
  );

  return (
    <Animated.View
      collapsable={false}
      nativeID={nativeID}
      ref={headerRef}
      onLayout={handleLayout}
      style={[childProps?.style, { transform: [{ translateY }], zIndex: isNowPlaying ? 0 : 10 }]}
    >
      {child ? cloneElement(child, { onLayout: undefined, style: { flex: 1 } }) : children}
    </Animated.View>
  );
});
