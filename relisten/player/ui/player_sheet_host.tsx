import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsDesktopLayout } from '@/relisten/util/layout';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  clamp,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlayerBottomBar, useIsPlayerBottomBarVisible } from './player_bottom_bar';
import { EmbeddedPlayerScreen } from './player_screen';
import {
  PLAYER_SHEET_STATES,
  PlayerSheetState,
  usePlayerSheetStateController,
} from './player_sheet_state';

const COLLAPSE_BUTTON_HIT_SLOP = 8;
const IOS_SHEET_VELOCITY_THRESHOLD = 900;
const IOS_SHEET_DISTANCE_THRESHOLD = 72;
const ANDROID_SHEET_VELOCITY_THRESHOLD = 650;
const ANDROID_SHEET_DISTANCE_THRESHOLD = 56;
const ANDROID_GESTURE_MIN_DISTANCE = 8;
const ANDROID_GESTURE_ACTIVE_OFFSET_Y: [number, number] = [-10, 10];
const ANDROID_GESTURE_FAIL_OFFSET_X: [number, number] = [-20, 20];
const ANDROID_GESTURE_HEADER_HEIGHT = 72;
const SHEET_SPRING_CONFIG = {
  damping: 30,
  mass: 0.8,
  overshootClamping: true,
  stiffness: 280,
};
const ANDROID_SHEET_TIMING_CONFIG = {
  duration: 220,
  easing: Easing.out(Easing.cubic),
};

export function PlayerSheetHost() {
  const { isExpanded, collapse, setSheetState } = usePlayerSheetStateController();
  const isDesktopLayout = useIsDesktopLayout();
  const isBottomBarVisible = useIsPlayerBottomBarVisible();
  const safeAreaInsets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const isAndroid = Platform.OS === 'android';
  const shouldUseInteractiveIos = Platform.OS === 'ios';
  const shouldUseAnimatedSheet = shouldUseInteractiveIos || isAndroid;
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
    if (!shouldUseAnimatedSheet || !shouldRenderHost) {
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
    shouldUseAnimatedSheet,
    shouldUseInteractiveIos,
  ]);

  useEffect(() => {
    if (!shouldUseAnimatedSheet || !shouldRenderHost) {
      return;
    }

    cancelAnimation(sheetTranslateY);
    if (isExpanded) {
      setSheetMounted(true);
      sheetTranslateY.value = shouldUseInteractiveIos
        ? withSpring(0, SHEET_SPRING_CONFIG)
        : withTiming(0, ANDROID_SHEET_TIMING_CONFIG);
      return;
    }

    if (shouldUseInteractiveIos) {
      sheetTranslateY.value = withSpring(
        collapsedTranslateYShared.value,
        SHEET_SPRING_CONFIG,
        (done) => {
          if (done) {
            runOnJS(setSheetMounted)(false);
          }
        }
      );
      return;
    }

    sheetTranslateY.value = withTiming(
      collapsedTranslateYShared.value,
      ANDROID_SHEET_TIMING_CONFIG,
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
    shouldUseAnimatedSheet,
    shouldUseInteractiveIos,
  ]);

  const createPanGesture = useCallback(() => {
    let panGesture = Gesture.Pan().minDistance(
      shouldUseInteractiveIos ? 2 : ANDROID_GESTURE_MIN_DISTANCE
    );
    if (isAndroid) {
      panGesture = panGesture
        .activeOffsetY(ANDROID_GESTURE_ACTIVE_OFFSET_Y)
        .failOffsetX(ANDROID_GESTURE_FAIL_OFFSET_X);
    }

    return panGesture
      .onBegin(() => {
        if (isAndroid) {
          return;
        }

        cancelAnimation(sheetTranslateY);
        dragStartTranslateY.value = sheetTranslateY.value;
        runOnJS(setSheetMounted)(true);
      })
      .onStart(() => {
        if (!isAndroid) {
          return;
        }

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
        const velocityThreshold = isAndroid
          ? ANDROID_SHEET_VELOCITY_THRESHOLD
          : IOS_SHEET_VELOCITY_THRESHOLD;
        const distanceThreshold = isAndroid
          ? ANDROID_SHEET_DISTANCE_THRESHOLD
          : IOS_SHEET_DISTANCE_THRESHOLD;
        const clampedCollapsedTranslateY = Math.max(collapsedTranslateYShared.value, 1);
        const progress = 1 - sheetTranslateY.value / clampedCollapsedTranslateY;
        const hasFastUpwardVelocity = event.velocityY < -velocityThreshold;
        const hasFastDownwardVelocity = event.velocityY > velocityThreshold;
        const hasSufficientDistance = Math.abs(event.translationY) > distanceThreshold;

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

        if (shouldUseInteractiveIos) {
          sheetTranslateY.value = withSpring(targetTranslateY, SHEET_SPRING_CONFIG, (done) => {
            if (!done) {
              return;
            }

            runOnJS(setSheetState)(nextState);
            if (nextState === PLAYER_SHEET_STATES.collapsed) {
              runOnJS(setSheetMounted)(false);
            }
          });
          return;
        }

        sheetTranslateY.value = withTiming(
          targetTranslateY,
          ANDROID_SHEET_TIMING_CONFIG,
          (done) => {
            if (!done) {
              return;
            }

            runOnJS(setSheetState)(nextState);
            if (nextState === PLAYER_SHEET_STATES.collapsed) {
              runOnJS(setSheetMounted)(false);
            }
          }
        );
      });
  }, [
    collapsedTranslateYShared,
    dragStartTranslateY,
    isAndroid,
    setSheetMounted,
    setSheetState,
    sheetTranslateY,
    shouldUseInteractiveIos,
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

  if (!shouldUseAnimatedSheet) {
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
          <EmbeddedPlayerScreen onDismissRequest={collapse} />
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
        <>
          {shouldUseInteractiveIos ? (
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
                  <EmbeddedPlayerScreen onDismissRequest={collapse} />
                </Animated.View>
              </Animated.View>
            </GestureDetector>
          ) : (
            <Animated.View style={[StyleSheet.absoluteFill, sheetAnimatedStyle]}>
              <Animated.View style={[styles.backdrop, backdropAnimatedStyle]} />
              <Animated.View
                style={[
                  styles.expandedSurface,
                  expandedSurfaceAnimatedStyle,
                  { paddingTop: safeAreaInsets.top },
                ]}
              >
                <GestureDetector gesture={sheetPanGesture}>
                  <View style={styles.androidGestureHeader}>
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
                  </View>
                </GestureDetector>
                <EmbeddedPlayerScreen onDismissRequest={collapse} />
              </Animated.View>
            </Animated.View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  androidGestureHeader: {
    height: ANDROID_GESTURE_HEADER_HEIGHT,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
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
