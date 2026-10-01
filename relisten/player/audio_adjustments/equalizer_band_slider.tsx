import { AudioAdjustmentSliderRow } from '@/relisten/player/audio_adjustments/audio_adjustment_slider';
import {
  AUDIO_ADJUSTMENT_BAND_GAIN_MAX_DB,
  AUDIO_ADJUSTMENT_BAND_GAIN_MIN_DB,
} from '@/relisten/player/audio_adjustments/audio_adjustment_types';

function signedDecibels(value: number) {
  if (value === 0) return '0 dB';
  return `${value > 0 ? '+' : ''}${value} dB`;
}

export function EqualizerBandSlider({
  disabled,
  frequencyLabel,
  onSlidingComplete,
  onValueChange,
  value,
}: {
  disabled: boolean;
  frequencyLabel: string;
  onSlidingComplete: () => void;
  onValueChange: (value: number) => void;
  value: number;
}) {
  return (
    <AudioAdjustmentSliderRow
      accessibilityLabel={frequencyLabel}
      accessibilityText={`${frequencyLabel}, ${signedDecibels(value)}`}
      disabled={disabled}
      maximumDb={AUDIO_ADJUSTMENT_BAND_GAIN_MAX_DB}
      minimumDb={AUDIO_ADJUSTMENT_BAND_GAIN_MIN_DB}
      onSlidingComplete={onSlidingComplete}
      onValueChange={onValueChange}
      valueDb={value}
    />
  );
}
