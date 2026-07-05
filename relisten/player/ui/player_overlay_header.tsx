import { OverflowMenuTrigger } from '@/relisten/components/menus/overflow_menu_trigger';
import { RelistenText } from '@/relisten/components/relisten_text';
import { PlayerActionsMenu } from '@/relisten/player/ui/player_actions_menu';
import { PLAYER_PANEL_BACKGROUND } from '@/relisten/player/ui/player_panel_row';
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
} from 'react-native-reanimated';

const DISMISS_ACTIVATION_DISTANCE = 10;
const DISMISS_PROJECTION_SECONDS = 0.18;

type PlayerOverlayHeaderProps = {
  mode: 'timeline' | 'history';
  onBack: () => void;
  onClose: () => void;
  queueActive: boolean;
};

export function PlayerOverlayHeader({
  mode,
  onBack,
  onClose,
  queueActive,
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
  const gestureDistance = Math.max(height * 0.72, 1);
  const isHistory = mode === 'history';
  const surfaceProgress = useSharedValue(isHistory || queueActive ? 1 : 0);

  useEffect(() => {
    surfaceProgress.value = withTiming(isHistory || queueActive ? 1 : 0, {
      duration: reduceMotion ? 100 : 180,
    });
  }, [isHistory, queueActive, reduceMotion, surfaceProgress]);

  const headerStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      surfaceProgress.value,
      [0, 1],
      ['rgba(0, 27, 33, 0)', PLAYER_PANEL_BACKGROUND]
    ),
    borderBottomColor: interpolateColor(
      surfaceProgress.value,
      [0, 1],
      ['rgba(60, 219, 255, 0)', 'rgba(60, 219, 255, 0.22)']
    ),
    borderBottomWidth: surfaceProgress.value,
  }));

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

      if (translationY < -DISMISS_ACTIVATION_DISTANCE) {
        stateManager.fail();
      } else if (translationY > DISMISS_ACTIVATION_DISTANCE) {
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
      const projectedProgress =
        playerPresentationProgress.value -
        (event.velocityY * DISMISS_PROJECTION_SECONDS) / gestureDistance;

      if (projectedProgress > 0.55) {
        runOnJS(openPlayer)();
      } else {
        runOnJS(closePlayer)();
      }
    });

  return (
    <GestureDetector gesture={collapseGesture}>
      <Animated.View
        className="flex-row items-center justify-between px-4 py-1"
        style={headerStyle}
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
      </Animated.View>
    </GestureDetector>
  );
}
