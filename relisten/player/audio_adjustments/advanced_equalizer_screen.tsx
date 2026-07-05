import { RelistenText } from '@/relisten/components/relisten_text';
import { useRelistenCastStatus } from '@/relisten/casting/cast_ui';
import { AudioAdjustmentPresetMenu } from '@/relisten/player/audio_adjustments/audio_adjustment_preset_menu';
import { useAudioAdjustmentEditing } from '@/relisten/player/audio_adjustments/audio_adjustment_editing';
import { EqualizerBandSlider } from '@/relisten/player/audio_adjustments/equalizer_band_slider';
import { EqualizerResponseCurve } from '@/relisten/player/audio_adjustments/equalizer_response_curve';
import {
  PLAYER_PANEL_BACKGROUND,
  PLAYER_PANEL_BORDER_COLOR,
  PLAYER_PANEL_DIVIDER_COLOR,
} from '@/relisten/player/ui/player_panel_theme';
import { AUDIO_ADJUSTMENT_FREQUENCIES_HZ } from '@/relisten/player/audio_adjustments/audio_adjustment_types';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';

function frequencyLabel(frequency: number) {
  return frequency >= 1000 ? `${frequency / 1000} kHz` : `${frequency} Hz`;
}

export function AdvancedEqualizerScreen() {
  const { configuration, finishAdjustment, setBandGain } = useAudioAdjustmentEditing();
  const { isCasting } = useRelistenCastStatus();

  return (
    <>
      <ScrollView
        contentContainerStyle={{ gap: 16, padding: 16, paddingBottom: 36 }}
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: RelistenBlue[950], flex: 1 }}
      >
        <View
          style={{
            backgroundColor: PLAYER_PANEL_BACKGROUND,
            borderColor: PLAYER_PANEL_BORDER_COLOR,
            borderCurve: 'continuous',
            borderRadius: 16,
            borderWidth: 1,
            overflow: 'hidden',
          }}
        >
          <AudioAdjustmentPresetMenu disabled={isCasting} />
          <View style={{ backgroundColor: PLAYER_PANEL_DIVIDER_COLOR, height: 1 }} />
          <View style={{ opacity: isCasting ? 0.45 : 1, padding: 14 }}>
            <EqualizerResponseCurve gains={configuration.bandGainsDb} />
          </View>
        </View>

        <View
          style={{
            backgroundColor: PLAYER_PANEL_BACKGROUND,
            borderColor: PLAYER_PANEL_BORDER_COLOR,
            borderCurve: 'continuous',
            borderRadius: 16,
            borderWidth: 1,
            overflow: 'hidden',
          }}
        >
          {AUDIO_ADJUSTMENT_FREQUENCIES_HZ.map((frequency, index) => (
            <View key={frequency}>
              {index > 0 && (
                <View style={{ backgroundColor: PLAYER_PANEL_DIVIDER_COLOR, height: 1 }} />
              )}
              <EqualizerBandSlider
                disabled={isCasting}
                frequencyLabel={frequencyLabel(frequency)}
                onSlidingComplete={finishAdjustment}
                onValueChange={(value) => setBandGain(index, value)}
                value={configuration.bandGainsDb[index]}
              />
            </View>
          ))}
        </View>

        <RelistenText className="text-sm text-gray-400" selectable={false}>
          Relisten automatically lowers the overall level when frequencies are boosted to reduce
          clipping.
        </RelistenText>
      </ScrollView>
      <Stack.Screen.Title>Advanced Equalizer</Stack.Screen.Title>
    </>
  );
}
