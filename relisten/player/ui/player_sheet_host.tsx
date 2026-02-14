import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsDesktopLayout } from '@/relisten/util/layout';
import { log } from '@/relisten/util/logging';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
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
import {
  COLLAPSED_CARD_BORDER_RADIUS,
  COLLAPSED_CARD_BOTTOM_MARGIN,
  COLLAPSED_CARD_HORIZONTAL_MARGIN,
  PlayerBottomBar,
  PlayerBottomBarSurface,
  useIsPlayerBottomBarVisible,
  useRelistenPlayerBottomBarContext,
} from './player_bottom_bar';
import { EmbeddedPlayerScreen } from './player_screen';
import {
  PLAYER_SHEET_STATES,
  PlayerSheetState,
  usePlayerSheetStateController,
} from './player_sheet_state';
import { useTabInsetSnapshot } from './tab_inset_adapter';

const COLLAPSE_BUTTON_HIT_SLOP = 8;
const IOS_SHEET_VELOCITY_THRESHOLD = 900;
const IOS_SHEET_DISTANCE_THRESHOLD = 72;
const ANDROID_SHEET_VELOCITY_THRESHOLD = 650;
const ANDROID_SHEET_DISTANCE_THRESHOLD = 56;
const ANDROID_GESTURE_MIN_DISTANCE = 8;
const ANDROID_GESTURE_ACTIVE_OFFSET_Y: [number, number] = [-10, 10];
const ANDROID_GESTURE_FAIL_OFFSET_X: [number, number] = [-20, 20];
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
const EMBEDDED_QUEUE_RENDER_DELAY_MS = 140;
const COLLAPSED_LAYER_FADE_END_PROGRESS = 0.52;
const EXPANDED_LAYER_FADE_START_PROGRESS = 0.56;

interface PlayerSheetFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PlayerSheetTransitionGeometryState {
  collapsedFrame: PlayerSheetFrame;
  expandedFrame: PlayerSheetFrame;
}

export function PlayerSheetHost() {
  const { isExpanded, collapse, setSheetState } = usePlayerSheetStateController();
  const isDesktopLayout = useIsDesktopLayout();
  const isBottomBarVisible = useIsPlayerBottomBarVisible();
  const safeAreaInsets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { bottomInset: tabInsetBottom } = useTabInsetSnapshot();
  const { playerBottomBarHeight, setPlayerBottomBarHeight } = useRelistenPlayerBottomBarContext();

  const isAndroid = Platform.OS === 'android';
  const shouldUseInteractiveIos = Platform.OS === 'ios';
  const shouldUseAnimatedSheet = shouldUseInteractiveIos || isAndroid;
  const shouldRenderHost = !isDesktopLayout && isBottomBarVisible;
  const collapsedTranslateY = Math.max(windowHeight, 1);
  const sheetTranslateY = useSharedValue(isExpanded ? 0 : collapsedTranslateY);
  const dragStartTranslateY = useSharedValue(0);
  const collapsedTranslateYShared = useSharedValue(collapsedTranslateY);

  const transitionGeometry = useMemo<PlayerSheetTransitionGeometryState>(() => {
    const collapsedWidth = Math.max(windowWidth - COLLAPSED_CARD_HORIZONTAL_MARGIN * 2, 1);
    const collapsedHeight = Math.max(playerBottomBarHeight, 1);
    const collapsedY = Math.max(
      windowHeight - tabInsetBottom - COLLAPSED_CARD_BOTTOM_MARGIN - collapsedHeight,
      0
    );

    return {
      collapsedFrame: {
        x: COLLAPSED_CARD_HORIZONTAL_MARGIN,
        y: collapsedY,
        width: collapsedWidth,
        height: collapsedHeight,
      },
      expandedFrame: {
        x: 0,
        y: 0,
        width: Math.max(windowWidth, 1),
        height: Math.max(windowHeight, 1),
      },
    };
  }, [playerBottomBarHeight, tabInsetBottom, windowHeight, windowWidth]);

  const collapsedFrameX = useSharedValue(transitionGeometry.collapsedFrame.x);
  const collapsedFrameY = useSharedValue(transitionGeometry.collapsedFrame.y);
  const collapsedFrameWidth = useSharedValue(transitionGeometry.collapsedFrame.width);
  const collapsedFrameHeight = useSharedValue(transitionGeometry.collapsedFrame.height);
  const expandedFrameX = useSharedValue(transitionGeometry.expandedFrame.x);
  const expandedFrameY = useSharedValue(transitionGeometry.expandedFrame.y);
  const expandedFrameWidth = useSharedValue(transitionGeometry.expandedFrame.width);
  const expandedFrameHeight = useSharedValue(transitionGeometry.expandedFrame.height);

  const [isSheetMounted, setIsSheetMounted] = useState(isExpanded);
  const isSheetMountedRef = useRef(isExpanded);
  const queueRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionLogger = useMemo(() => log.extend('player-sheet-transition'), []);
  const [shouldRenderEmbeddedQueue, setShouldRenderEmbeddedQueue] = useState(isExpanded);

  const onCollapsedSurfaceLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { height } = e.nativeEvent.layout;
      if (playerBottomBarHeight !== height) {
        setPlayerBottomBarHeight(height);
      }
    },
    [playerBottomBarHeight, setPlayerBottomBarHeight]
  );

  const logDevMarker = useCallback(
    (marker: string, details?: string) => {
      if (!__DEV__) {
        return;
      }

      transitionLogger.debug(`[marker] ${marker}${details ? ` ${details}` : ''}`);
    },
    [transitionLogger]
  );

  const clearQueueRenderTimer = useCallback(() => {
    if (queueRenderTimerRef.current === null) {
      return;
    }

    clearTimeout(queueRenderTimerRef.current);
    queueRenderTimerRef.current = null;
  }, []);

  const logGestureStart = useCallback(
    (platformName: 'ios' | 'android', startTranslateY: number, collapsedY: number) => {
      logDevMarker(
        'gesture_start',
        `platform=${platformName} startY=${startTranslateY.toFixed(1)} collapsedY=${collapsedY.toFixed(1)}`
      );
    },
    [logDevMarker]
  );

  const logGestureEnd = useCallback(
    (translationY: number, velocityY: number, progress: number, nextState: PlayerSheetState) => {
      logDevMarker(
        'gesture_end',
        `translationY=${translationY.toFixed(1)} velocityY=${velocityY.toFixed(1)} progress=${progress.toFixed(3)} next=${nextState}`
      );
    },
    [logDevMarker]
  );

  const logTransitionComplete = useCallback(
    (nextState: PlayerSheetState) => {
      logDevMarker('transition_complete', `state=${nextState}`);
    },
    [logDevMarker]
  );

  const setSheetMounted = useCallback((mounted: boolean) => {
    isSheetMountedRef.current = mounted;
    setIsSheetMounted(mounted);
  }, []);

  useEffect(() => {
    return () => {
      clearQueueRenderTimer();
    };
  }, [clearQueueRenderTimer]);

  useEffect(() => {
    if (!shouldRenderHost) {
      clearQueueRenderTimer();
      setShouldRenderEmbeddedQueue(false);
      return;
    }

    if (!shouldUseAnimatedSheet) {
      setShouldRenderEmbeddedQueue(isExpanded);
      return;
    }

    if (!isExpanded) {
      clearQueueRenderTimer();
      setShouldRenderEmbeddedQueue(false);
      logDevMarker('queue_gate', 'deferred while collapsed');
      return;
    }

    clearQueueRenderTimer();
    logDevMarker('queue_gate', `schedule delayMs=${EMBEDDED_QUEUE_RENDER_DELAY_MS}`);
    queueRenderTimerRef.current = setTimeout(() => {
      setShouldRenderEmbeddedQueue(true);
      queueRenderTimerRef.current = null;
      logDevMarker('queue_gate', 'mounted after expand settle');
    }, EMBEDDED_QUEUE_RENDER_DELAY_MS);
  }, [clearQueueRenderTimer, isExpanded, logDevMarker, shouldRenderHost, shouldUseAnimatedSheet]);

  useEffect(() => {
    if (!shouldUseAnimatedSheet || !shouldRenderHost) {
      return;
    }

    collapsedTranslateYShared.value = collapsedTranslateY;
    collapsedFrameX.value = transitionGeometry.collapsedFrame.x;
    collapsedFrameY.value = transitionGeometry.collapsedFrame.y;
    collapsedFrameWidth.value = transitionGeometry.collapsedFrame.width;
    collapsedFrameHeight.value = transitionGeometry.collapsedFrame.height;
    expandedFrameX.value = transitionGeometry.expandedFrame.x;
    expandedFrameY.value = transitionGeometry.expandedFrame.y;
    expandedFrameWidth.value = transitionGeometry.expandedFrame.width;
    expandedFrameHeight.value = transitionGeometry.expandedFrame.height;

    if (!isSheetMountedRef.current && !isExpanded) {
      sheetTranslateY.value = collapsedTranslateY;
    }
  }, [
    collapsedFrameHeight,
    collapsedFrameWidth,
    collapsedFrameX,
    collapsedFrameY,
    collapsedTranslateY,
    collapsedTranslateYShared,
    expandedFrameHeight,
    expandedFrameWidth,
    expandedFrameX,
    expandedFrameY,
    isExpanded,
    sheetTranslateY,
    shouldRenderHost,
    shouldUseAnimatedSheet,
    transitionGeometry,
  ]);

  useEffect(() => {
    if (!shouldUseAnimatedSheet || !shouldRenderHost) {
      return;
    }

    logDevMarker(
      'transition_start',
      `target=${isExpanded ? 'expanded' : 'collapsed'} source=state`
    );
    cancelAnimation(sheetTranslateY);
    if (isExpanded) {
      setSheetMounted(true);
      sheetTranslateY.value = shouldUseInteractiveIos
        ? withSpring(0, SHEET_SPRING_CONFIG, (done) => {
            if (done && __DEV__) {
              runOnJS(logTransitionComplete)(PLAYER_SHEET_STATES.expanded);
            }
          })
        : withTiming(0, ANDROID_SHEET_TIMING_CONFIG, (done) => {
            if (done && __DEV__) {
              runOnJS(logTransitionComplete)(PLAYER_SHEET_STATES.expanded);
            }
          });
      return;
    }

    if (shouldUseInteractiveIos) {
      sheetTranslateY.value = withSpring(
        collapsedTranslateYShared.value,
        SHEET_SPRING_CONFIG,
        (done) => {
          if (done && __DEV__) {
            runOnJS(logTransitionComplete)(PLAYER_SHEET_STATES.collapsed);
          }
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
        if (done && __DEV__) {
          runOnJS(logTransitionComplete)(PLAYER_SHEET_STATES.collapsed);
        }
        if (done) {
          runOnJS(setSheetMounted)(false);
        }
      }
    );
  }, [
    collapsedTranslateYShared,
    isExpanded,
    logDevMarker,
    logTransitionComplete,
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
        'worklet';
        cancelAnimation(sheetTranslateY);
        dragStartTranslateY.value = sheetTranslateY.value;
        if (__DEV__) {
          runOnJS(logGestureStart)(
            isAndroid ? 'android' : 'ios',
            dragStartTranslateY.value,
            collapsedTranslateYShared.value
          );
        }
        if (!isAndroid) {
          runOnJS(setSheetMounted)(true);
        }
      })
      .onStart(() => {
        'worklet';
        if (isAndroid) {
          runOnJS(setSheetMounted)(true);
        }
      })
      .onUpdate((event) => {
        'worklet';
        const nextTranslateY = clamp(
          dragStartTranslateY.value + event.translationY,
          0,
          collapsedTranslateYShared.value
        );
        sheetTranslateY.value = nextTranslateY;
      })
      .onEnd((event) => {
        'worklet';
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
        if (__DEV__) {
          runOnJS(logGestureEnd)(event.translationY, event.velocityY, progress, nextState);
          runOnJS(logDevMarker)(
            'transition_start',
            `target=${nextState} source=gesture velocityY=${event.velocityY.toFixed(1)}`
          );
        }

        if (shouldUseInteractiveIos) {
          sheetTranslateY.value = withSpring(targetTranslateY, SHEET_SPRING_CONFIG, (done) => {
            if (!done) {
              return;
            }

            if (__DEV__) {
              runOnJS(logTransitionComplete)(nextState);
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

            if (__DEV__) {
              runOnJS(logTransitionComplete)(nextState);
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
    logDevMarker,
    logGestureEnd,
    logGestureStart,
    logTransitionComplete,
    setSheetMounted,
    setSheetState,
    sheetTranslateY,
    shouldUseInteractiveIos,
  ]);

  const sheetPanGesture = useMemo(() => createPanGesture(), [createPanGesture]);
  const bottomBarPanGesture = useMemo(() => createPanGesture(), [createPanGesture]);
  const sheetHeader = (
    <View style={[styles.expandedHeader, { paddingTop: safeAreaInsets.top }]}>
      <View style={styles.expandedHeaderSide} />
      <View style={styles.expandedHeaderCenter}>
        {isAndroid ? (
          <GestureDetector gesture={sheetPanGesture}>
            <View style={styles.expandedHeaderGestureZone}>
              <View style={styles.expandedHeaderHandle} />
            </View>
          </GestureDetector>
        ) : (
          <View style={styles.expandedHeaderGestureZone}>
            <View style={styles.expandedHeaderHandle} />
          </View>
        )}
      </View>
      <View style={styles.expandedHeaderSide}>
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
  );

  const backdropAnimatedStyle = useAnimatedStyle(() => {
    const progress = 1 - sheetTranslateY.value / Math.max(collapsedTranslateYShared.value, 1);
    const clampedProgress = clamp(progress, 0, 1);

    return {
      opacity: interpolate(clampedProgress, [0, 1], [0, 0.5]),
    };
  });

  const continuitySurfaceAnimatedStyle = useAnimatedStyle(() => {
    const progress = 1 - sheetTranslateY.value / Math.max(collapsedTranslateYShared.value, 1);
    const clampedProgress = clamp(progress, 0, 1);

    return {
      borderRadius: interpolate(clampedProgress, [0, 1], [COLLAPSED_CARD_BORDER_RADIUS, 0]),
      borderWidth: interpolate(clampedProgress, [0, 1], [StyleSheet.hairlineWidth, 0]),
      elevation: interpolate(clampedProgress, [0, 1], [12, 0]),
      height: interpolate(
        clampedProgress,
        [0, 1],
        [collapsedFrameHeight.value, expandedFrameHeight.value]
      ),
      left: interpolate(clampedProgress, [0, 1], [collapsedFrameX.value, expandedFrameX.value]),
      shadowOpacity: interpolate(clampedProgress, [0, 1], [0.35, 0]),
      shadowRadius: interpolate(clampedProgress, [0, 1], [12, 0]),
      top: interpolate(clampedProgress, [0, 1], [collapsedFrameY.value, expandedFrameY.value]),
      width: interpolate(
        clampedProgress,
        [0, 1],
        [collapsedFrameWidth.value, expandedFrameWidth.value]
      ),
    };
  });

  const collapsedSurfaceAnimatedStyle = useAnimatedStyle(() => {
    const progress = 1 - sheetTranslateY.value / Math.max(collapsedTranslateYShared.value, 1);
    const clampedProgress = clamp(progress, 0, 1);

    return {
      opacity: interpolate(
        clampedProgress,
        [0, COLLAPSED_LAYER_FADE_END_PROGRESS, 1],
        [1, 0.08, 0]
      ),
    };
  });

  const expandedSurfaceAnimatedStyle = useAnimatedStyle(() => {
    const progress = 1 - sheetTranslateY.value / Math.max(collapsedTranslateYShared.value, 1);
    const clampedProgress = clamp(progress, 0, 1);

    return {
      opacity: interpolate(clampedProgress, [0, EXPANDED_LAYER_FADE_START_PROGRESS, 1], [0, 0, 1]),
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
      <View pointerEvents="box-none" style={styles.hostRoot}>
        <View style={styles.expandedSurface}>
          {sheetHeader}
          <View style={styles.expandedContent}>
            <EmbeddedPlayerScreen
              includeTopSafeArea={false}
              onDismissRequest={collapse}
              shouldRenderQueue={shouldRenderEmbeddedQueue}
            />
          </View>
        </View>
      </View>
    );
  }

  const continuityLayer = (
    <Animated.View style={[styles.continuitySurface, continuitySurfaceAnimatedStyle]}>
      <Animated.View
        pointerEvents={isExpanded ? 'none' : 'auto'}
        style={[styles.collapsedSurfaceLayer, collapsedSurfaceAnimatedStyle]}
      >
        {isAndroid ? (
          <GestureDetector gesture={bottomBarPanGesture}>
            <View>
              <PlayerBottomBarSurface onLayout={onCollapsedSurfaceLayout} />
            </View>
          </GestureDetector>
        ) : (
          <PlayerBottomBarSurface onLayout={onCollapsedSurfaceLayout} />
        )}
      </Animated.View>

      {shouldRenderSheet && (
        <Animated.View
          pointerEvents={isExpanded ? 'auto' : 'box-none'}
          style={[styles.expandedSurface, expandedSurfaceAnimatedStyle]}
        >
          {sheetHeader}
          <View style={styles.expandedContent}>
            <EmbeddedPlayerScreen
              includeTopSafeArea={false}
              onDismissRequest={collapse}
              shouldRenderQueue={shouldRenderEmbeddedQueue}
            />
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );

  // Two host UI states:
  // - collapsed: floating bottom card entrypoint during playback (with drag affordance).
  // - expanded: full player surface mounted in tabs with interruptible snapping behavior.
  return (
    <View pointerEvents="box-none" style={styles.hostRoot}>
      <Animated.View pointerEvents="none" style={[styles.backdrop, backdropAnimatedStyle]} />
      {shouldUseInteractiveIos ? (
        <GestureDetector gesture={sheetPanGesture}>{continuityLayer}</GestureDetector>
      ) : (
        continuityLayer
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  collapsedSurfaceLayer: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  continuitySurface: {
    backgroundColor: '#00141a',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
  },
  expandedSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00141a',
    overflow: 'hidden',
    zIndex: 1,
  },
  expandedContent: {
    flex: 1,
  },
  expandedHeader: {
    alignItems: 'center',
    backgroundColor: '#00141a',
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: 8,
  },
  expandedHeaderCenter: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  expandedHeaderGestureZone: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 16,
  },
  expandedHeaderHandle: {
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 2,
    height: 4,
    width: 42,
  },
  expandedHeaderSide: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
  },
  collapseButton: {
    padding: 8,
  },
  hostRoot: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'visible',
  },
});
