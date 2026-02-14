import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsDesktopLayout } from '@/relisten/util/layout';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  cancelAnimation,
  clamp,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlayerBottomBar, useIsPlayerBottomBarVisible } from './player_bottom_bar';
import { PlayerScreen } from './player_screen';
import {
  PLAYER_SHEET_STATES,
  PlayerSheetState,
  usePlayerSheetStateController,
} from './player_sheet_state';

const COLLAPSE_BUTTON_HIT_SLOP = 8;
const SHEET_VELOCITY_THRESHOLD = 900;
const SHEET_DISTANCE_THRESHOLD = 72;
const SHEET_SPRING_CONFIG = {
  damping: 30,
  mass: 0.8,
  overshootClamping: true,
  stiffness: 280,
};

export function PlayerSheetHost() {
  const { isExpanded, collapse, setSheetState } = usePlayerSheetStateController();
  const isDesktopLayout = useIsDesktopLayout();
  const isBottomBarVisible = useIsPlayerBottomBarVisible();
  const safeAreaInsets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const shouldUseInteractiveIos = Platform.OS === 'ios';
  const shouldRenderHost = !isDesktopLayout && isBottomBarVisible;
  const collapsedTranslateY = Math.max(windowHeight, 1);
  const sheetTranslateY = useSharedValue(isExpanded ? 0 : collapsedTranslateY);
  const dragStartTranslateY = useSharedValue(0);
  const collapsedTranslateYShared = useSharedValue(collapsedTranslateY);

  const [isSheetMounted, setIsSheetMounted] = useState(isExpanded);
  const isSheetMountedRef = useRef(isExpanded);
  const setSheetMounted = useCallback((mounted: boolean) => {
    isSheetMountedRef.current = mounted;
    setIsSheetMounted(mounted);
  }, []);

  useEffect(() => {
    if (!shouldUseInteractiveIos || !shouldRenderHost) {
      return;
    }

    collapsedTranslateYShared.value = collapsedTranslateY;

    if (!isSheetMountedRef.current && !isExpanded) {
      sheetTranslateY.value = collapsedTranslateY;
    }
  }, [
    collapsedTranslateY,
    collapsedTranslateYShared,
    isExpanded,
    sheetTranslateY,
    shouldRenderHost,
    shouldUseInteractiveIos,
  ]);

  useEffect(() => {
    if (!shouldUseInteractiveIos || !shouldRenderHost) {
      return;
    }

    cancelAnimation(sheetTranslateY);
    if (isExpanded) {
      setSheetMounted(true);
      sheetTranslateY.value = withSpring(0, SHEET_SPRING_CONFIG);
      return;
    }

    sheetTranslateY.value = withSpring(
      collapsedTranslateYShared.value,
      SHEET_SPRING_CONFIG,
      (done) => {
        if (done) {
          runOnJS(setSheetMounted)(false);
        }
      }
    );
  }, [
    collapsedTranslateYShared,
    isExpanded,
    setSheetMounted,
    sheetTranslateY,
    shouldRenderHost,
    shouldUseInteractiveIos,
  ]);

  const createPanGesture = useCallback(() => {
    return Gesture.Pan()
      .minDistance(2)
      .onBegin(() => {
        cancelAnimation(sheetTranslateY);
        dragStartTranslateY.value = sheetTranslateY.value;
        runOnJS(setSheetMounted)(true);
      })
      .onUpdate((event) => {
        const nextTranslateY = clamp(
          dragStartTranslateY.value + event.translationY,
          0,
          collapsedTranslateYShared.value
        );
        sheetTranslateY.value = nextTranslateY;
      })
      .onEnd((event) => {
        const clampedCollapsedTranslateY = Math.max(collapsedTranslateYShared.value, 1);
        const progress = 1 - sheetTranslateY.value / clampedCollapsedTranslateY;
        const hasFastUpwardVelocity = event.velocityY < -SHEET_VELOCITY_THRESHOLD;
        const hasFastDownwardVelocity = event.velocityY > SHEET_VELOCITY_THRESHOLD;
        const hasSufficientDistance = Math.abs(event.translationY) > SHEET_DISTANCE_THRESHOLD;

        let nextState: PlayerSheetState;
        if (hasFastUpwardVelocity) {
          nextState = PLAYER_SHEET_STATES.expanded;
        } else if (hasFastDownwardVelocity) {
          nextState = PLAYER_SHEET_STATES.collapsed;
        } else if (hasSufficientDistance) {
          nextState =
            event.translationY < 0 ? PLAYER_SHEET_STATES.expanded : PLAYER_SHEET_STATES.collapsed;
        } else {
          nextState =
            progress >= 0.5 ? PLAYER_SHEET_STATES.expanded : PLAYER_SHEET_STATES.collapsed;
        }

        const targetTranslateY =
          nextState === PLAYER_SHEET_STATES.expanded ? 0 : collapsedTranslateYShared.value;

        sheetTranslateY.value = withSpring(targetTranslateY, SHEET_SPRING_CONFIG, (done) => {
          if (!done) {
            return;
          }

          runOnJS(setSheetState)(nextState);
          if (nextState === PLAYER_SHEET_STATES.collapsed) {
            runOnJS(setSheetMounted)(false);
          }
        });
      });
  }, [
    collapsedTranslateYShared,
    dragStartTranslateY,
    setSheetMounted,
    setSheetState,
    sheetTranslateY,
  ]);

  const sheetPanGesture = useMemo(() => createPanGesture(), [createPanGesture]);
  const bottomBarPanGesture = useMemo(() => createPanGesture(), [createPanGesture]);

  const sheetAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: sheetTranslateY.value }],
    };
  });
  const backdropAnimatedStyle = useAnimatedStyle(() => {
    const progress = 1 - sheetTranslateY.value / Math.max(collapsedTranslateYShared.value, 1);
    const clampedProgress = clamp(progress, 0, 1);

    return {
      opacity: interpolate(clampedProgress, [0, 1], [0, 0.5], Extrapolation.CLAMP),
    };
  });
  const expandedSurfaceAnimatedStyle = useAnimatedStyle(() => {
    const progress = 1 - sheetTranslateY.value / Math.max(collapsedTranslateYShared.value, 1);
    const clampedProgress = clamp(progress, 0, 1);

    return {
      borderRadius: interpolate(clampedProgress, [0, 1], [20, 0], Extrapolation.CLAMP),
    };
  });
  const bottomBarAnimatedStyle = useAnimatedStyle(() => {
    const progress = 1 - sheetTranslateY.value / Math.max(collapsedTranslateYShared.value, 1);
    const clampedProgress = clamp(progress, 0, 1);

    return {
      opacity: interpolate(clampedProgress, [0, 1], [1, 0], Extrapolation.CLAMP),
    };
  });

  const shouldRenderSheet = isSheetMounted || isExpanded;

  if (!shouldRenderHost) {
    return null;
  }

  if (!shouldUseInteractiveIos) {
    // Two host UI states:
    // - collapsed: floating bottom card entrypoint during playback.
    // - expanded: full player surface mounted in tabs with collapse action.
    if (!isExpanded) {
      return <PlayerBottomBar />;
    }

    return (
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View style={[styles.expandedSurface, { paddingTop: safeAreaInsets.top }]}>
          <View style={styles.collapseButtonContainer}>
            <Pressable
              accessibilityLabel="Collapse player"
              accessibilityRole="button"
              hitSlop={COLLAPSE_BUTTON_HIT_SLOP}
              onPress={collapse}
              style={styles.collapseButton}
            >
              <MaterialCommunityIcons name="chevron-down" size={28} color="white" />
            </Pressable>
          </View>
          <PlayerScreen variant="embedded" />
        </View>
      </View>
    );
  }

  // Two host UI states:
  // - collapsed: floating bottom card entrypoint during playback (with drag affordance).
  // - expanded: full player surface mounted in tabs with interruptible snapping behavior.
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, bottomBarAnimatedStyle]}
      >
        <PlayerBottomBar gesture={bottomBarPanGesture} />
      </Animated.View>
      {shouldRenderSheet && (
        <GestureDetector gesture={sheetPanGesture}>
          <Animated.View style={[StyleSheet.absoluteFill, sheetAnimatedStyle]}>
            <Animated.View style={[styles.backdrop, backdropAnimatedStyle]} />
            <Animated.View
              style={[
                styles.expandedSurface,
                expandedSurfaceAnimatedStyle,
                { paddingTop: safeAreaInsets.top },
              ]}
            >
              <View style={styles.collapseButtonContainer}>
                <Pressable
                  accessibilityLabel="Collapse player"
                  accessibilityRole="button"
                  hitSlop={COLLAPSE_BUTTON_HIT_SLOP}
                  onPress={collapse}
                  style={styles.collapseButton}
                >
                  <MaterialCommunityIcons name="chevron-down" size={28} color="white" />
                </Pressable>
              </View>
              <PlayerScreen variant="embedded" />
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  expandedSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00141a',
    overflow: 'hidden',
  },
  collapseButtonContainer: {
    position: 'absolute',
    right: 8,
    top: 4,
    zIndex: 2,
  },
  collapseButton: {
    padding: 8,
  },
});
