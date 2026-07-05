import { RelistenText } from '@/relisten/components/relisten_text';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { TouchableOpacity } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export function ReturnToNowPlayingButton({
  bottomInset,
  onPress,
  visible,
}: {
  bottomInset: number;
  onPress: () => void;
  visible: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(visible ? 1 : 0);
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = reduceMotion
        ? withTiming(1, { duration: 100, easing: Easing.out(Easing.quad) })
        : withSpring(1, { damping: 19, mass: 0.7, stiffness: 250 });
      return;
    }

    progress.value = withTiming(
      0,
      { duration: reduceMotion ? 80 : 120, easing: Easing.in(Easing.quad) },
      (finished) => {
        if (finished) runOnJS(setMounted)(false);
      }
    );
  }, [progress, reduceMotion, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: reduceMotion ? 1 : 0.92 + progress.value * 0.08 }],
  }));

  if (!mounted) return null;

  return (
    <Animated.View
      className="absolute self-center"
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        {
          bottom: bottomInset + 12,
          boxShadow: '0 6px 18px rgba(0, 0, 0, 0.42)',
          elevation: 1000,
          zIndex: 1000,
        },
        animatedStyle,
      ]}
    >
      <TouchableOpacity
        accessibilityHint="Returns to the current track and player controls."
        accessibilityLabel="Return to Now Playing"
        accessibilityRole="button"
        className="min-h-11 flex-row items-center gap-2 rounded-full border border-relisten-blue-200/35 bg-relisten-blue-700 px-4 py-2"
        onPress={onPress}
        style={{ borderCurve: 'continuous' }}
      >
        <MaterialIcons color="white" name="my-location" size={18} />
        <RelistenText className="font-semibold" selectable={false}>
          Now Playing
        </RelistenText>
      </TouchableOpacity>
    </Animated.View>
  );
}
