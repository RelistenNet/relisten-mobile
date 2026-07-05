import { RelistenText } from '@/relisten/components/relisten_text';
import { useRelistenCastStatus } from '@/relisten/casting/cast_ui';
import { AudioAdjustmentSection } from '@/relisten/player/audio_adjustments/audio_adjustment_section';
import { useAudioAdjustmentEditing } from '@/relisten/player/audio_adjustments/audio_adjustment_editing';
import { AudioAdjustmentPresetMenu } from '@/relisten/player/audio_adjustments/audio_adjustment_preset_menu';
import { AudioAdjustmentSlider } from '@/relisten/player/audio_adjustments/audio_adjustment_slider';
import { EqualizerResponseCurve } from '@/relisten/player/audio_adjustments/equalizer_response_curve';
import {
  AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MAX_DB,
  AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MIN_DB,
} from '@/relisten/player/audio_adjustments/audio_adjustment_types';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import { tw } from '@/relisten/util/tw';

function reductionLabel(value: number) {
  return value === 0 ? 'Off' : `${value} dB`;
}

export function AudioAdjustmentsScreen() {
  const {
    configuration,
    finishAdjustment,
    requestClose,
    reset,
    setEnabled,
    setExtraVolumeReduction,
  } = useAudioAdjustmentEditing();
  const { deviceName, isCasting } = useRelistenCastStatus();

  return (
    <>
      <ScrollView
        className="flex-1 bg-relisten-blue-950"
        contentContainerStyle={{ gap: 20, padding: 16, paddingBottom: 36 }}
        contentInsetAdjustmentBehavior="automatic"
      >
        {isCasting && (
          <View
            accessibilityRole="alert"
            className="gap-1 rounded-[14px] border border-relisten-blue-200/15 bg-relisten-blue-900 p-3.5"
            style={{ borderCurve: 'continuous' }}
          >
            <RelistenText className="font-bold" selectable={false}>
              Unavailable while casting{deviceName ? ` to ${deviceName}` : ''}
            </RelistenText>
            <RelistenText className="text-gray-300" selectable={false}>
              Audio Equalizer affects local playback only. Your saved settings resume when casting
              ends.
            </RelistenText>
          </View>
        )}

        <AudioAdjustmentSection title="Playback">
          <View
            className={tw('min-h-[58px] flex-row items-center px-4', isCasting && 'opacity-45')}
          >
            <View className="flex-1 gap-0.5 py-2.5">
              <RelistenText className="font-semibold" selectable={false}>
                Audio Equalizer
              </RelistenText>
              <RelistenText className="text-sm text-gray-400" selectable={false}>
                {configuration.enabled ? 'On for local playback' : 'Off — your settings are saved'}
              </RelistenText>
            </View>
            <View className="items-center self-stretch justify-center">
              <Switch
                accessibilityLabel="Audio Equalizer"
                className="self-center"
                disabled={isCasting}
                onValueChange={setEnabled}
                value={configuration.enabled}
              />
            </View>
          </View>
        </AudioAdjustmentSection>

        <AudioAdjustmentSection title="Equalizer">
          <AudioAdjustmentPresetMenu disabled={isCasting} />
          <View className="h-px bg-relisten-blue-200/10" />
          <View className={tw('gap-2 p-3.5', isCasting && 'opacity-45')}>
            <EqualizerResponseCurve gains={configuration.bandGainsDb} />
            <Pressable
              accessibilityRole="button"
              className="min-h-12 flex-row items-center rounded-xl border border-relisten-blue-200/25 px-3.5"
              disabled={isCasting}
              onPress={() => router.push('/relisten/audio-adjustments/equalizer')}
              style={({ pressed }) => ({
                borderCurve: 'continuous',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <RelistenText className="flex-1 font-semibold" selectable={false}>
                Customize Equalizer
              </RelistenText>
              <Ionicons color={RelistenBlue[300]} name="chevron-forward" size={18} />
            </Pressable>
          </View>
        </AudioAdjustmentSection>

        <AudioAdjustmentSection title="Volume">
          <View className={tw('gap-1.5 p-3.5', isCasting && 'opacity-45')}>
            <View className="flex-row justify-between gap-3">
              <RelistenText className="min-w-0 flex-1 font-semibold" selectable={false}>
                Extra Volume Reduction
              </RelistenText>
              <RelistenText className="shrink-0 text-relisten-blue-200" selectable={false}>
                {reductionLabel(configuration.extraVolumeReductionDb)}
              </RelistenText>
            </View>
            <AudioAdjustmentSlider
              activeTrackDirection="maximum"
              accessibilityLabel="Extra Volume Reduction"
              accessibilityText={reductionLabel(configuration.extraVolumeReductionDb)}
              disabled={isCasting}
              maximumDb={AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MAX_DB}
              minimumDb={AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MIN_DB}
              onSlidingComplete={finishAdjustment}
              onValueChange={setExtraVolumeReduction}
              valueDb={configuration.extraVolumeReductionDb}
            />
            <RelistenText className="text-sm text-gray-400" selectable={false}>
              Makes Relisten quieter than the iPhone volume control allows. This affects Relisten
              only.
            </RelistenText>
          </View>
        </AudioAdjustmentSection>

        <Pressable
          accessibilityRole="button"
          className="min-h-12 items-center justify-center rounded-xl border border-relisten-blue-200/25 px-3.5"
          disabled={isCasting}
          onPress={() =>
            Alert.alert(
              'Reset Equalizer?',
              'This selects Flat, sets every band to 0 dB, and turns Extra Volume Reduction off. Audio Equalizer will keep its current On or Off state.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: reset },
              ]
            )
          }
          style={({ pressed }) => ({
            borderCurve: 'continuous',
            opacity: isCasting ? 0.45 : pressed ? 0.7 : 1,
          })}
        >
          <RelistenText className="font-semibold" selectable={false}>
            Reset Equalizer…
          </RelistenText>
        </Pressable>

        <RelistenText selectable={false} className="text-center text-xs text-gray-500">
          Changes apply immediately and are saved on this iPhone.
        </RelistenText>
      </ScrollView>

      <Stack.Screen.Title>Audio Equalizer</Stack.Screen.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel="Close Audio Equalizer"
          icon="xmark"
          onPress={requestClose}
        />
      </Stack.Toolbar>
    </>
  );
}
