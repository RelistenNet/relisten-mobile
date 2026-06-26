import { View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

export function PlayerBackground() {
  return (
    <View
      pointerEvents="none"
      style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 0 }}
    >
      <Svg height="100%" width="100%">
        <Defs>
          <LinearGradient id="base" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor="#001b21" />
            <Stop offset="0.58" stopColor="#001114" />
            <Stop offset="1" stopColor="#00252e" />
          </LinearGradient>
          <RadialGradient id="upperGlow" cx="50%" cy="24%" r="62%">
            <Stop offset="0" stopColor="#0087a6" stopOpacity="0.22" />
            <Stop offset="0.5" stopColor="#005165" stopOpacity="0.08" />
            <Stop offset="1" stopColor="#001114" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="lowerGlow" cx="48%" cy="78%" r="58%">
            <Stop offset="0" stopColor="#006f89" stopOpacity="0.15" />
            <Stop offset="1" stopColor="#001114" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#base)" height="100%" width="100%" />
        <Rect fill="url(#upperGlow)" height="100%" width="100%" />
        <Rect fill="url(#lowerGlow)" height="100%" width="100%" />
      </Svg>
    </View>
  );
}
