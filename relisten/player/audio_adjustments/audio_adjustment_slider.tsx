import { RelistenBlue } from '@/relisten/relisten_blue';
import Slider from '@react-native-community/slider';
import colors from 'tailwindcss/colors';

type AudioAdjustmentSliderProps = {
  accessibilityLabel: string;
  accessibilityText: string;
  disabled: boolean;
  maximumDb: number;
  minimumDb: number;
  onSlidingComplete: () => void;
  onValueChange: (valueDb: number) => void;
  valueDb: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function AudioAdjustmentSlider({
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
  const normalizedValue = clamp((valueDb - minimumDb) / rangeDb, 0, 1);

  return (
    <Slider
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{
        max: maximumDb,
        min: minimumDb,
        now: valueDb,
        text: accessibilityText,
      }}
      disabled={disabled}
      maximumTrackTintColor={RelistenBlue[800]}
      maximumValue={1}
      minimumTrackTintColor={RelistenBlue[300]}
      minimumValue={0}
      onSlidingComplete={onSlidingComplete}
      onValueChange={(value) => onValueChange(minimumDb + Math.round(value * rangeDb))}
      step={1 / rangeDb}
      thumbTintColor={colors.gray[50]}
      value={normalizedValue}
    />
  );
}
