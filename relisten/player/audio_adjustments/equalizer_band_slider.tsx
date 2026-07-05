import { RelistenText } from '@/relisten/components/relisten_text';
import { AudioAdjustmentSlider } from '@/relisten/player/audio_adjustments/audio_adjustment_slider';
import {
  AUDIO_ADJUSTMENT_BAND_GAIN_MAX_DB,
  AUDIO_ADJUSTMENT_BAND_GAIN_MIN_DB,
} from '@/relisten/player/audio_adjustments/audio_adjustment_types';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { View } from 'react-native';

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
    <View style={{ gap: 2, minHeight: 72, opacity: disabled ? 0.45 : 1, padding: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <RelistenText selectable={false} style={{ fontWeight: '600' }}>
          {frequencyLabel}
        </RelistenText>
        <RelistenText selectable={false} style={{ color: RelistenBlue[200] }}>
          {signedDecibels(value)}
        </RelistenText>
      </View>
      <AudioAdjustmentSlider
        accessibilityLabel={frequencyLabel}
        accessibilityText={`${frequencyLabel}, ${signedDecibels(value)}`}
        disabled={disabled}
        maximumDb={AUDIO_ADJUSTMENT_BAND_GAIN_MAX_DB}
        minimumDb={AUDIO_ADJUSTMENT_BAND_GAIN_MIN_DB}
        onSlidingComplete={onSlidingComplete}
        onValueChange={onValueChange}
        valueDb={value}
      />
    </View>
  );
}
