import { OverflowMenuTrigger } from '@/relisten/components/menus/overflow_menu_trigger';
import { RelistenText } from '@/relisten/components/relisten_text';
import { PlayerActionsMenu } from '@/relisten/player/ui/player_actions_menu';
import {
  PLAYER_PANEL_BACKGROUND,
  PLAYER_PANEL_ACCENT_COLOR,
  PLAYER_PANEL_DIVIDER_COLOR,
} from '@/relisten/player/ui/player_panel_theme';
import {
  PLAYER_DISMISS_ACTIVATION_DISTANCE,
  playerDismissGestureDistance,
  shouldFinishPlayerDismiss,
} from '@/relisten/player/ui/player_dismissal';
import {
  playerPresentationProgress,
  usePlayerPresentation,
} from '@/relisten/player/ui/player_presentation';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

type PlayerOverlayHeaderProps = {
  mode: 'timeline' | 'history';
  onBack: () => void;
  onClose: () => void;
  queueActive: boolean;
  queueSurfaceProgress: SharedValue<number>;
};

export function PlayerOverlayHeader({
  mode,
  onBack,
  onClose,
  queueActive,
  queueSurfaceProgress,
}: PlayerOverlayHeaderProps) {
  'use no memo';

  const { fontScale, height } = useWindowDimensions();
  const { beginInteractivePresentation, closePlayer, openPlayer } = usePlayerPresentation();
  const reduceMotion = useReducedMotion();
  const controlScale = accessibleControlScale(fontScale);
  const touchSize = 44 * controlScale;
  const touchStartY = useSharedValue(0);
  const gestureStartProgress = useSharedValue(1);
  const gestureStartTranslationY = useSharedValue(0);
  const gestureDistance = playerDismissGestureDistance(height);
  const isHistory = mode === 'history';
  const historySurfaceProgress = useSharedValue(isHistory ? 1 : 0);

  useEffect(() => {
    historySurfaceProgress.value = withTiming(isHistory ? 1 : 0, {
      duration: reduceMotion ? 100 : 180,
    });
  }, [historySurfaceProgress, isHistory, reduceMotion]);

  const headerStyle = useAnimatedStyle(() => {
    const surfaceProgress = Math.max(queueSurfaceProgress.value, historySurfaceProgress.value);
    return {
      backgroundColor: interpolateColor(
        surfaceProgress,
        [0, 1],
        ['rgba(0, 27, 33, 0)', PLAYER_PANEL_BACKGROUND]
      ),
      borderBottomColor: interpolateColor(
        surfaceProgress,
        [0, 1],
        ['rgba(101, 226, 255, 0)', PLAYER_PANEL_DIVIDER_COLOR]
      ),
      borderBottomWidth: surfaceProgress,
    };
  });

  const collapseGesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((event) => {
      touchStartY.value = event.allTouches[0]?.absoluteY ?? 0;
    })
    .onTouchesMove((event, stateManager) => {
      const currentY = event.allTouches[0]?.absoluteY;

      if (currentY === undefined) {
        return;
      }

      const translationY = currentY - touchStartY.value;

      if (translationY < -PLAYER_DISMISS_ACTIVATION_DISTANCE) {
        stateManager.fail();
      } else if (translationY > PLAYER_DISMISS_ACTIVATION_DISTANCE) {
        stateManager.activate();
      }
    })
    .onStart((event) => {
      gestureStartProgress.value = playerPresentationProgress.value;
      gestureStartTranslationY.value = event.translationY;
      runOnJS(beginInteractivePresentation)();
    })
    .onUpdate((event) => {
      const translationY = event.translationY - gestureStartTranslationY.value;
      playerPresentationProgress.value = Math.max(
        0,
        Math.min(1, gestureStartProgress.value - translationY / gestureDistance)
      );
    })
    .onEnd((event) => {
      if (
        shouldFinishPlayerDismiss(
          playerPresentationProgress.value,
          event.velocityY,
          gestureDistance
        )
      ) {
        runOnJS(closePlayer)();
      } else {
        runOnJS(openPlayer)();
      }
    });

  return (
    <GestureDetector gesture={collapseGesture}>
      <Animated.View style={headerStyle}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={{ alignItems: 'center', paddingTop: 4 * controlScale }}
        >
          <View
            style={{
              backgroundColor: PLAYER_PANEL_ACCENT_COLOR,
              borderRadius: 999,
              height: 4 * controlScale,
              width: 36 * controlScale,
            }}
          />
        </View>
        <View
          className="flex-row items-center justify-between px-4 pb-1"
          style={{ paddingTop: 2 * controlScale }}
        >
          <TouchableOpacity
            accessibilityLabel={isHistory ? 'Back to queue' : 'Collapse player'}
            accessibilityRole="button"
            className="items-center justify-center rounded-full bg-white/5"
            onPress={isHistory ? onBack : onClose}
            style={{ height: touchSize, width: touchSize }}
          >
            <Ionicons
              color="white"
              name={isHistory ? 'chevron-back' : 'chevron-down'}
              size={24 * controlScale}
            />
          </TouchableOpacity>
          <RelistenText
            className="text-lg font-semibold"
            maxFontSizeMultiplier={1.5}
            numberOfLines={1}
            selectable={false}
            style={{ flex: 1, minWidth: 0, textAlign: 'center' }}
          >
            {isHistory ? 'Listening History' : queueActive ? 'Queue' : 'Now Playing'}
          </RelistenText>
          {isHistory ? (
            <TouchableOpacity
              accessibilityLabel="Collapse player"
              accessibilityRole="button"
              className="items-center justify-center rounded-full bg-white/5"
              onPress={onClose}
              style={{ height: touchSize, width: touchSize }}
            >
              <Ionicons color="white" name="chevron-down" size={24 * controlScale} />
            </TouchableOpacity>
          ) : (
            <PlayerActionsMenu onBeforeNavigate={onClose}>
              <View className="rounded-full bg-white/5" collapsable={false}>
                <OverflowMenuTrigger accessibilityLabel="Player actions" />
              </View>
            </PlayerActionsMenu>
          )}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}
