import { RelistenBlue } from '@/relisten/relisten_blue';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

const WAVEFORM_BAR_COUNT = 96;
const WAVEFORM_BARS = Array.from({ length: WAVEFORM_BAR_COUNT }, (_, index) => {
  const envelope = 0.3 + Math.sin((index / (WAVEFORM_BAR_COUNT - 1)) * Math.PI) ** 0.45 * 0.7;
  const detail = 0.25 + (((index * 47 + index * index * 13) % 97) / 96) * 0.75;

  return 7 + Math.round(envelope * detail * 48);
});

export function PlayerAudioVisualizer() {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ aspectRatio: 5.5, width: '100%' }}
    >
      <Svg
        height="100%"
        preserveAspectRatio="none"
        viewBox={`0 0 ${WAVEFORM_BAR_COUNT * 2} 58`}
        width="100%"
      >
        <Line
          opacity={0.3}
          stroke={RelistenBlue['200']}
          strokeDasharray="0.5 1.5"
          strokeWidth="0.6"
          x1="0"
          x2={WAVEFORM_BAR_COUNT * 2}
          y1="29"
          y2="29"
        />
        {WAVEFORM_BARS.map((height, index) => {
          const x = index * 2 + 1;

          return (
            <Line
              key={`${index}-${height}`}
              opacity={0.55 + (index % 4) * 0.1}
              stroke={RelistenBlue['200']}
              strokeLinecap="round"
              strokeWidth="1"
              x1={x}
              x2={x}
              y1={29 - height / 2}
              y2={29 + height / 2}
            />
          );
        })}
      </Svg>
    </View>
  );
}
