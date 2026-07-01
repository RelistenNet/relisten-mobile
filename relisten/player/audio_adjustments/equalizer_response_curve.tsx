import {
  AUDIO_ADJUSTMENT_BAND_GAIN_MAX_DB,
  AUDIO_ADJUSTMENT_BAND_GAIN_MIN_DB,
  type AudioAdjustmentBandGains,
} from '@/relisten/player/audio_adjustments/audio_adjustment_types';
import { RelistenBlue } from '@/relisten/relisten_blue';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { View } from 'react-native';

const VIEWBOX_WIDTH = 320;
const VIEWBOX_HEIGHT = 128;
const HORIZONTAL_PADDING = 12;
const VERTICAL_PADDING = 12;
const GAIN_RANGE_DB = AUDIO_ADJUSTMENT_BAND_GAIN_MAX_DB - AUDIO_ADJUSTMENT_BAND_GAIN_MIN_DB;

function responsePath(gains: AudioAdjustmentBandGains) {
  const drawableWidth = VIEWBOX_WIDTH - HORIZONTAL_PADDING * 2;
  const drawableHeight = VIEWBOX_HEIGHT - VERTICAL_PADDING * 2;
  const points = gains.map((gain, index) => ({
    x: HORIZONTAL_PADDING + (index / (gains.length - 1)) * drawableWidth,
    y:
      VERTICAL_PADDING +
      ((AUDIO_ADJUSTMENT_BAND_GAIN_MAX_DB - gain) / GAIN_RANGE_DB) * drawableHeight,
  }));

  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

export function EqualizerResponseCurve({ gains }: { gains: AudioAdjustmentBandGains }) {
  const drawableWidth = VIEWBOX_WIDTH - HORIZONTAL_PADDING * 2;
  const drawableHeight = VIEWBOX_HEIGHT - VERTICAL_PADDING * 2;
  const points = gains.map((gain, index) => ({
    x: HORIZONTAL_PADDING + (index / (gains.length - 1)) * drawableWidth,
    y:
      VERTICAL_PADDING +
      ((AUDIO_ADJUSTMENT_BAND_GAIN_MAX_DB - gain) / GAIN_RANGE_DB) * drawableHeight,
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ aspectRatio: 2.5, width: '100%' }}
    >
      <Svg height="100%" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} width="100%">
        <Line
          stroke={RelistenBlue[700]}
          strokeOpacity={0.65}
          strokeWidth={1}
          x1={HORIZONTAL_PADDING}
          x2={VIEWBOX_WIDTH - HORIZONTAL_PADDING}
          y1={VIEWBOX_HEIGHT / 2}
          y2={VIEWBOX_HEIGHT / 2}
        />
        {points.map((point) => (
          <Line
            key={point.x}
            stroke={RelistenBlue[800]}
            strokeWidth={1}
            x1={point.x}
            x2={point.x}
            y1={VERTICAL_PADDING}
            y2={VIEWBOX_HEIGHT - VERTICAL_PADDING}
          />
        ))}
        <Path
          d={responsePath(gains)}
          fill="none"
          stroke={RelistenBlue[300]}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
        />
        {points.map((point) => (
          <Circle
            key={`${point.x}-${point.y}`}
            cx={point.x}
            cy={point.y}
            fill={RelistenBlue[200]}
            r={3.5}
          />
        ))}
      </Svg>
    </View>
  );
}
