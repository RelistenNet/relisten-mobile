import { RelistenText } from '@/relisten/components/relisten_text';
import { useRelistenCastStatus } from '@/relisten/casting/cast_ui';
import { AudioAdjustmentCard } from '@/relisten/player/audio_adjustments/audio_adjustment_section';
import { AudioAdjustmentPresetMenu } from '@/relisten/player/audio_adjustments/audio_adjustment_preset_menu';
import { useAudioAdjustmentEditing } from '@/relisten/player/audio_adjustments/audio_adjustment_editing';
import { EqualizerBandSlider } from '@/relisten/player/audio_adjustments/equalizer_band_slider';
import { EqualizerResponseCurve } from '@/relisten/player/audio_adjustments/equalizer_response_curve';
import { AUDIO_ADJUSTMENT_FREQUENCIES_HZ } from '@/relisten/player/audio_adjustments/audio_adjustment_types';
import { Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { tw } from '@/relisten/util/tw';

function frequencyLabel(frequency: number) {
  return frequency >= 1000 ? `${frequency / 1000} kHz` : `${frequency} Hz`;
}

export function AdvancedEqualizerScreen() {
  const { configuration, finishAdjustment, setBandGain } = useAudioAdjustmentEditing();
  const { isCasting } = useRelistenCastStatus();

  return (
    <>
      <ScrollView
        className="flex-1 bg-relisten-blue-950"
        contentContainerStyle={{ gap: 16, padding: 16, paddingBottom: 36 }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <AudioAdjustmentCard>
          <AudioAdjustmentPresetMenu disabled={isCasting} />
          <View className="h-px bg-relisten-blue-200/10" />
          <View className={tw('p-3.5', isCasting && 'opacity-45')}>
            <EqualizerResponseCurve gains={configuration.bandGainsDb} />
          </View>
        </AudioAdjustmentCard>

        <AudioAdjustmentCard>
          {AUDIO_ADJUSTMENT_FREQUENCIES_HZ.map((frequency, index) => (
            <View key={frequency}>
              {index > 0 && <View className="h-px bg-relisten-blue-200/10" />}
              <EqualizerBandSlider
                disabled={isCasting}
                frequencyLabel={frequencyLabel(frequency)}
                onSlidingComplete={finishAdjustment}
                onValueChange={(value) => setBandGain(index, value)}
                value={configuration.bandGainsDb[index]}
              />
            </View>
          ))}
        </AudioAdjustmentCard>

        <RelistenText className="text-sm text-gray-400" selectable={false}>
          Relisten automatically lowers the overall level when frequencies are boosted to reduce
          clipping.
        </RelistenText>
      </ScrollView>
      <Stack.Screen.Title>Advanced Equalizer</Stack.Screen.Title>
    </>
  );
}
