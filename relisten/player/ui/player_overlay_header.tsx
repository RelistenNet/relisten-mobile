import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { usePlayerDismissGesture } from './use_player_dismiss_gesture';
import { usePlayerPresentation } from './player_presentation';

/** One visible dismissal control; the surrounding header also accepts a downward drag. */
export function PlayerOverlayHeader({ interactive }: { interactive: boolean }) {
  const { closePlayer } = usePlayerPresentation();
  const collapseGesture = usePlayerDismissGesture(interactive);

  return (
    <GestureDetector gesture={collapseGesture}>
      <View className="h-14 items-center justify-center" collapsable={false}>
        <TouchableOpacity
          accessibilityLabel="Collapse player"
          accessibilityRole="button"
          accessibilityElementsHidden={!interactive}
          importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
          className="h-11 w-11 items-center justify-center"
          disabled={!interactive}
          onPress={() => closePlayer()}
        >
          <Ionicons color="rgba(255, 255, 255, 0.8)" name="chevron-down" size={25} />
        </TouchableOpacity>
      </View>
    </GestureDetector>
  );
}
