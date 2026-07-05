import { RelistenText } from '@/relisten/components/relisten_text';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import { MaterialIcons } from '@expo/vector-icons';
import { TouchableOpacity, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

export function ReturnToNowPlayingButton({
  onPress,
  visible,
}: {
  onPress: () => void;
  visible: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);
  const reduceMotion = useReducedMotion();

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(reduceMotion ? 100 : 160)}
      exiting={FadeOut.duration(reduceMotion ? 80 : 120)}
      style={{
        alignSelf: 'center',
        bottom: 16,
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.42)',
        elevation: 1000,
        position: 'absolute',
        zIndex: 1000,
      }}
    >
      <TouchableOpacity
        accessibilityHint="Returns to the current track and player controls."
        accessibilityLabel="Return to Now Playing"
        accessibilityRole="button"
        onPress={onPress}
        style={{
          alignItems: 'center',
          backgroundColor: RelistenBlue[700],
          borderColor: 'rgba(147, 224, 242, 0.36)',
          borderCurve: 'continuous',
          borderRadius: 22 * controlScale,
          borderWidth: 1,
          flexDirection: 'row',
          gap: 7,
          minHeight: 44 * controlScale,
          paddingHorizontal: 14 * controlScale,
        }}
      >
        <MaterialIcons color="white" name="my-location" size={18 * controlScale} />
        <RelistenText className="font-semibold" selectable={false}>
          Now Playing
        </RelistenText>
      </TouchableOpacity>
    </Animated.View>
  );
}
