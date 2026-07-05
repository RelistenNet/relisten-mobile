import { RelistenText } from '@/relisten/components/relisten_text';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

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
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      const animation = reduceMotion
        ? Animated.timing(progress, {
            duration: 100,
            easing: Easing.out(Easing.quad),
            toValue: 1,
            useNativeDriver: true,
          })
        : Animated.spring(progress, {
            damping: 19,
            mass: 0.7,
            stiffness: 250,
            toValue: 1,
            useNativeDriver: true,
          });
      animation.start();
      return () => animation.stop();
    }

    const animation = Animated.timing(progress, {
      duration: reduceMotion ? 80 : 120,
      easing: Easing.in(Easing.quad),
      toValue: 0,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => animation.stop();
  }, [progress, reduceMotion, visible]);

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={{
        alignSelf: 'center',
        bottom: 16,
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.42)',
        elevation: 1000,
        opacity: progress,
        position: 'absolute',
        transform: [
          {
            scale: reduceMotion
              ? 1
              : progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }),
          },
        ],
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
