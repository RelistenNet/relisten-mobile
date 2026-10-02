import { RelistenText } from '@/relisten/components/relisten_text';
import { useRelistenCastStatus } from '@/relisten/casting/cast_ui';
import {
  AUDIO_ADJUSTMENT_CARD_PADDING,
  AudioAdjustmentSection,
} from '@/relisten/player/audio_adjustments/audio_adjustment_section';
import { useAudioAdjustmentEditing } from '@/relisten/player/audio_adjustments/audio_adjustment_editing';
import { AudioAdjustmentPresetMenu } from '@/relisten/player/audio_adjustments/audio_adjustment_preset_menu';
import { AudioAdjustmentSliderRow } from '@/relisten/player/audio_adjustments/audio_adjustment_slider';
import { EqualizerResponseCurve } from '@/relisten/player/audio_adjustments/equalizer_response_curve';
import {
  AUDIO_ADJUSTMENT_VOLUME_GAIN_MAX_DB,
  AUDIO_ADJUSTMENT_VOLUME_GAIN_MIN_DB,
} from '@/relisten/player/audio_adjustments/audio_adjustment_types';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tw } from '@/relisten/util/tw';

function gainLabel(value: number) {
  return `${value > 0 ? '+' : ''}${value} dB`;
}

export function AudioAdjustmentsScreen() {
  const { configuration, finishAdjustment, requestClose, reset, setEnabled, setVolumeGain } =
    useAudioAdjustmentEditing();
  const { deviceName, isCasting } = useRelistenCastStatus();
  const insets = useSafeAreaInsets();

  return (
    <>
      <ScrollView
        className="flex-1 bg-relisten-blue-950"
        contentContainerStyle={{
          gap: 16,
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 16) + 16,
        }}
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
            className={tw('min-h-[58px] flex-row items-center', isCasting && 'opacity-45')}
            style={{ padding: AUDIO_ADJUSTMENT_CARD_PADDING }}
          >
            <View style={{ flex: 1, gap: 2 }}>
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
          <View
            style={{
              padding: AUDIO_ADJUSTMENT_CARD_PADDING,
              gap: 8,
              opacity: isCasting ? 0.45 : 1,
            }}
          >
            <EqualizerResponseCurve compact gains={configuration.bandGainsDb} />
            <Pressable
              accessibilityRole="button"
              className="min-h-12 flex-row items-center rounded-xl border border-relisten-blue-200/25 px-3.5 py-3"
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
          <AudioAdjustmentSliderRow
            centered
            description="Boost can distort loud recordings"
            accessibilityLabel="Volume Gain"
            accessibilityText={gainLabel(configuration.extraVolumeReductionDb)}
            disabled={isCasting}
            maximumDb={AUDIO_ADJUSTMENT_VOLUME_GAIN_MAX_DB}
            minimumDb={AUDIO_ADJUSTMENT_VOLUME_GAIN_MIN_DB}
            onSlidingComplete={finishAdjustment}
            onValueChange={setVolumeGain}
            valueDb={configuration.extraVolumeReductionDb}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <RelistenText
                className="text-xs text-gray-400"
                style={{ flex: 1 }}
                selectable={false}
              >
                −30 dB
              </RelistenText>
              <RelistenText
                className="text-xs text-gray-300"
                style={{ flex: 1, textAlign: 'center' }}
                selectable={false}
              >
                0 dB
              </RelistenText>
              <RelistenText
                className="text-xs text-gray-400"
                style={{ flex: 1, textAlign: 'right' }}
                selectable={false}
              >
                +12 dB
              </RelistenText>
            </View>
          </AudioAdjustmentSliderRow>
        </AudioAdjustmentSection>

        <Pressable
          accessibilityRole="button"
          className="min-h-12 items-center justify-center rounded-xl border border-relisten-blue-200/25 px-3.5 py-3"
          disabled={isCasting}
          onPress={() =>
            Alert.alert(
              'Reset Equalizer?',
              'This selects Flat, sets every band to 0 dB, and returns Volume Gain to 0 dB. Audio Equalizer will keep its current On or Off state.',
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
