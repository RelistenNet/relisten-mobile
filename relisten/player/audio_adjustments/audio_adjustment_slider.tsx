import { RelistenBlue } from '@/relisten/relisten_blue';
import Slider from '@react-native-community/slider';
import colors from 'tailwindcss/colors';
import { View } from 'react-native';
import {
  decibelsToSliderPosition,
  sliderPositionToDecibels,
} from './audio_adjustment_slider_scale';

type AudioAdjustmentSliderProps = {
  centered?: boolean;
  accessibilityLabel: string;
  accessibilityText: string;
  disabled: boolean;
  maximumDb: number;
  minimumDb: number;
  onSlidingComplete: () => void;
  onValueChange: (valueDb: number) => void;
  valueDb: number;
};

export function AudioAdjustmentSlider({
  centered = false,
  accessibilityLabel,
  accessibilityText,
  disabled,
  maximumDb,
  minimumDb,
  onSlidingComplete,
  onValueChange,
  valueDb,
}: AudioAdjustmentSliderProps) {
  const rangeDb = maximumDb - minimumDb;
  const normalizedValue = decibelsToSliderPosition(valueDb, minimumDb, maximumDb, centered);

  return (
    <View style={{ height: 40, justifyContent: 'center' }}>
      {centered && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 14,
            right: 14,
            height: 2,
            backgroundColor: RelistenBlue[800],
          }}
        >
          <View
            style={{
              position: 'absolute',
              height: 2,
              left: `${Math.min(0.5, normalizedValue) * 100}%`,
              width: `${Math.abs(normalizedValue - 0.5) * 100}%`,
              backgroundColor: RelistenBlue[300],
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: '50%',
              top: -4,
              width: 2,
              height: 10,
              marginLeft: -1,
              backgroundColor: RelistenBlue[200],
            }}
          />
        </View>
      )}
      <Slider
        style={{ height: 40 }}
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{
          max: maximumDb,
          min: minimumDb,
          now: valueDb,
          text: accessibilityText,
        }}
        disabled={disabled}
        maximumTrackTintColor={centered ? 'transparent' : RelistenBlue[800]}
        maximumValue={1}
        minimumTrackTintColor={centered ? 'transparent' : RelistenBlue[300]}
        minimumValue={0}
        onSlidingComplete={onSlidingComplete}
        onValueChange={(value) =>
          onValueChange(sliderPositionToDecibels(value, minimumDb, maximumDb, centered))
        }
        step={centered ? 0 : 1 / rangeDb}
        thumbTintColor={colors.gray[50]}
        value={normalizedValue}
      />
    </View>
  );
}
