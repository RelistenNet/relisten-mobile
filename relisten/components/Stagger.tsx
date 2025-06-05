import * as React from 'react';

import type { ViewStyle } from 'react-native';
import type {
  BaseAnimationBuilder,
  EntryExitAnimationFunction,
  Keyframe,
} from 'react-native-reanimated';
import Animated, {
  ComplexAnimationBuilder,
  FadeInDown,
  FadeOutDown,
  Layout,
  runOnJS,
} from 'react-native-reanimated';

export type StaggerProps = React.PropsWithChildren<{
  enabled?: boolean;
  /**
   * The direction of the enter animation.
   *
   * -1 means the animation will start from the last child and go to the first child.
   *
   * 1 means the animation will start from the first child and go to the last child.
   */
  enterDirection?: -1 | 1;
  duration?: number;
  style?: ViewStyle;
  /**
   * Return the desired animation builder. It can be any of
   * https://www.reanimated2.com/docs/api/LayoutAnimations/entryAnimations.
   *
   * Custom animation: https://www.reanimated2.com/docs/api/LayoutAnimations/customAnimations.
   *
   * Keyframes animations: https://www.reanimated2.com/docs/api/LayoutAnimations/keyframeAnimations
   *
   */
  entering?: () =>
    | ComplexAnimationBuilder
    | BaseAnimationBuilder
    | typeof BaseAnimationBuilder
    | EntryExitAnimationFunction
    | typeof Keyframe;
  /**
   * Return the desired animation builder. It can be any of
   * https://www.reanimated2.com/docs/api/LayoutAnimations/exitAnimations.
   *
   * Custom animation: https://www.reanimated2.com/docs/api/LayoutAnimations/customAnimations.
   *
   * Keyframes animations: https://www.reanimated2.com/docs/api/LayoutAnimations/keyframeAnimations
   *
   */
  exiting?: () =>
    | ComplexAnimationBuilder
    | BaseAnimationBuilder
    | typeof BaseAnimationBuilder
    | EntryExitAnimationFunction
    | typeof Keyframe;

  onEnterFinished?: () => void;
  onExitFinished?: () => void;
  initialEnteringDelay?: number;
}>;
export function Stagger({
  children,
  enabled = true,
  enterDirection = 1,
  duration = 400,
  style,
  entering = () => FadeInDown.duration(400),
  exiting = () => FadeOutDown.duration(400),
  initialEnteringDelay = 0,
  onEnterFinished,
  onExitFinished,
}: StaggerProps) {
  const [state, setState] = React.useState(0);
  React.useEffect(() => {}, [children]);

  const incrementIndex = React.useCallback(() => {
    setState((i) => Math.min(i + 1, React.Children.count(children)));
  }, [children]);

  if (!children) {
    return null;
  }

  if (!enabled) {
    return <Animated.View style={style}>{children}</Animated.View>;
  }

  return (
    <Animated.View style={style} layout={Layout} className="flex flex-col gap-2">
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) {
          return null;
        }

        if (enterDirection === -1) {
          const isVisible = state >= React.Children.count(children) - 1 - index;
          if (!isVisible) return null;
        } else {
          const isVisible = state >= index;

          if (!isVisible) return null;
        }

        const isLastEnter =
          index === (enterDirection === 1 ? React.Children.count(children) - 1 : 0);
        const isLastExit =
          index === (enterDirection === -1 ? React.Children.count(children) - 1 : 0);

        return (
          <Animated.View
            key={child.key ?? index}
            layout={Layout}
            entering={(entering() as ComplexAnimationBuilder)
              .delay(initialEnteringDelay)
              .duration(duration)
              .withCallback((finished) => {
                'worklet';
                if (finished) {
                  runOnJS(incrementIndex)();
                }
                if (finished && isLastEnter && onEnterFinished) {
                  runOnJS(onEnterFinished)();
                }
              })}
            exiting={(exiting() as ComplexAnimationBuilder)
              .duration(duration)
              .withCallback((finished) => {
                'worklet';
                if (finished && isLastExit && onExitFinished) {
                  runOnJS(onExitFinished)();
                }
              })}
            // @ts-expect-error child.props is unknown
            style={[child.props.style]}
          >
            {child}
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}
