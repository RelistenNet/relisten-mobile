import { RelistenText } from '@/relisten/components/relisten_text';
import {
  AUDIO_ADJUSTMENT_BAND_GAIN_MAX_DB,
  AUDIO_ADJUSTMENT_BAND_GAIN_MIN_DB,
} from '@/relisten/player/audio_adjustments/audio_adjustment_types';
import { RelistenBlue } from '@/relisten/relisten_blue';
import Slider from '@react-native-community/slider';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';

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
      <Slider
        accessibilityLabel={frequencyLabel}
        accessibilityValue={{
          max: AUDIO_ADJUSTMENT_BAND_GAIN_MAX_DB,
          min: AUDIO_ADJUSTMENT_BAND_GAIN_MIN_DB,
          now: value,
          text: `${frequencyLabel}, ${signedDecibels(value)}`,
        }}
        disabled={disabled}
        maximumTrackTintColor={RelistenBlue[800]}
        maximumValue={AUDIO_ADJUSTMENT_BAND_GAIN_MAX_DB}
        minimumTrackTintColor={RelistenBlue[300]}
        minimumValue={AUDIO_ADJUSTMENT_BAND_GAIN_MIN_DB}
        onSlidingComplete={onSlidingComplete}
        onValueChange={onValueChange}
        step={1}
        thumbTintColor={colors.gray[50]}
        value={value}
      />
    </View>
  );
}
