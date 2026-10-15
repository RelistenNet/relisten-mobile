import { useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

export function PlayerBackground({ backdropProgress }: { backdropProgress: SharedValue<number> }) {
  const queueStyle = useAnimatedStyle(() => ({ opacity: backdropProgress.value }));
  const id = useId().replace(/:/g, '');
  const [size, setSize] = useState({ width: 0, height: 0 });
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={({ nativeEvent: { layout } }) =>
        setSize((current) =>
          current.width === layout.width && current.height === layout.height
            ? current
            : { width: layout.width, height: layout.height }
        )
      }
    >
      <Svg height={size.height} width={size.width}>
        <Defs>
          <LinearGradient id={`${id}-base`} x1="0%" x2="0%" y1="0%" y2="100%">
            <Stop offset="0" stopColor="#001b21" />
            <Stop offset="0.58" stopColor="#001114" />
            <Stop offset="1" stopColor="#00252e" />
          </LinearGradient>
          <RadialGradient id={`${id}-upperGlow`} cx="50%" cy="24%" r="62%">
            <Stop offset="0" stopColor="#0087a6" stopOpacity="0.22" />
            <Stop offset="0.5" stopColor="#005165" stopOpacity="0.08" />
            <Stop offset="1" stopColor="#001114" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={`${id}-lowerGlow`} cx="48%" cy="78%" r="58%">
            <Stop offset="0" stopColor="#006f89" stopOpacity="0.15" />
            <Stop offset="1" stopColor="#001114" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${id}-base)`} height={size.height} width={size.width} />
        <Rect fill={`url(#${id}-upperGlow)`} height={size.height} width={size.width} />
        <Rect fill={`url(#${id}-lowerGlow)`} height={size.height} width={size.width} />
      </Svg>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: '#001D24' }, queueStyle]}
      />
    </View>
  );
}
