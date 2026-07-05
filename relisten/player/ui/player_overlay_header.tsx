import { OverflowMenuTrigger } from '@/relisten/components/menus/overflow_menu_trigger';
import { RelistenText } from '@/relisten/components/relisten_text';
import { PlayerActionsMenu } from '@/relisten/player/ui/player_actions_menu';
import {
  playerPresentationProgress,
  usePlayerPresentation,
} from '@/relisten/player/ui/player_presentation';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useSharedValue } from 'react-native-reanimated';

const DISMISS_ACTIVATION_DISTANCE = 10;
const DISMISS_PROJECTION_SECONDS = 0.18;

type PlayerOverlayHeaderProps = {
  onClose: () => void;
};

export function PlayerOverlayHeader({ onClose }: PlayerOverlayHeaderProps) {
  'use no memo';

  const { fontScale, height } = useWindowDimensions();
  const { beginInteractivePresentation, closePlayer, openPlayer } = usePlayerPresentation();
  const controlScale = accessibleControlScale(fontScale);
  const touchSize = 44 * controlScale;
  const touchStartY = useSharedValue(0);
  const gestureStartProgress = useSharedValue(1);
  const gestureStartTranslationY = useSharedValue(0);
  const gestureDistance = Math.max(height * 0.72, 1);
  const buttonSurfaceStyle = {
    alignItems: 'center' as const,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(101, 226, 255, 0.16)',
    borderCurve: 'continuous' as const,
    borderRadius: touchSize / 2,
    borderWidth: 1,
    height: touchSize,
    justifyContent: 'center' as const,
    width: touchSize,
  };

  const collapseGesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((event) => {
      touchStartY.value = event.allTouches[0]?.absoluteY ?? 0;
    })
    .onTouchesMove((event, stateManager) => {
      const currentY = event.allTouches[0]?.absoluteY;
      if (currentY === undefined) return;

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
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          gap: 12 * controlScale,
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 6 * controlScale,
        }}
      >
        <TouchableOpacity
          accessibilityLabel="Collapse player"
          accessibilityRole="button"
          onPress={onClose}
          style={buttonSurfaceStyle}
        >
          <Ionicons color="white" name="chevron-down" size={24 * controlScale} />
        </TouchableOpacity>
        <RelistenText
          className="text-lg font-semibold"
          maxFontSizeMultiplier={1.5}
          numberOfLines={1}
          selectable={false}
          style={{ flex: 1, minWidth: 0, textAlign: 'center' }}
        >
          Now Playing
        </RelistenText>
        <PlayerActionsMenu onBeforeNavigate={onClose}>
          <View collapsable={false} style={buttonSurfaceStyle}>
            <OverflowMenuTrigger accessibilityLabel="Player actions" />
          </View>
        </PlayerActionsMenu>
      </Animated.View>
    </GestureDetector>
  );
}
