import { RelistenText } from '@/relisten/components/relisten_text';
import { AudioAdjustmentSlider } from '@/relisten/player/audio_adjustments/audio_adjustment_slider';
import {
  AUDIO_ADJUSTMENT_BAND_GAIN_MAX_DB,
  AUDIO_ADJUSTMENT_BAND_GAIN_MIN_DB,
} from '@/relisten/player/audio_adjustments/audio_adjustment_types';
import { View } from 'react-native';
import { tw } from '@/relisten/util/tw';

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
    <View className={tw('min-h-[72px] gap-0.5 p-3.5', disabled && 'opacity-45')}>
      <View className="flex-row justify-between">
        <RelistenText className="font-semibold" selectable={false}>
          {frequencyLabel}
        </RelistenText>
        <RelistenText className="text-relisten-blue-200" selectable={false}>
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
