import { RelistenText } from '@/relisten/components/relisten_text';
import { useRelistenCastStatus } from '@/relisten/casting/cast_ui';
import { AudioAdjustmentSection } from '@/relisten/player/audio_adjustments/audio_adjustment_section';
import { useAudioAdjustmentEditing } from '@/relisten/player/audio_adjustments/audio_adjustment_editing';
import { AudioAdjustmentPresetMenu } from '@/relisten/player/audio_adjustments/audio_adjustment_preset_menu';
import { EqualizerResponseCurve } from '@/relisten/player/audio_adjustments/equalizer_response_curve';
import {
  AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MAX_DB,
  AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MIN_DB,
} from '@/relisten/player/audio_adjustments/audio_adjustment_types';
import { RelistenBlue } from '@/relisten/relisten_blue';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import colors from 'tailwindcss/colors';

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
        contentContainerStyle={{ gap: 20, padding: 16, paddingBottom: 36 }}
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: RelistenBlue[950], flex: 1 }}
      >
        {isCasting && (
          <View
            accessibilityRole="alert"
            style={{
              backgroundColor: RelistenBlue[800],
              borderCurve: 'continuous',
              borderRadius: 14,
              gap: 4,
              padding: 14,
            }}
          >
            <RelistenText selectable={false} style={{ fontWeight: '700' }}>
              Unavailable while casting{deviceName ? ` to ${deviceName}` : ''}
            </RelistenText>
            <RelistenText className="text-gray-300" selectable={false}>
              Audio adjustments affect local playback only. Your saved settings resume when casting
              ends.
            </RelistenText>
          </View>
        )}

        <AudioAdjustmentSection title="Playback">
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              minHeight: 58,
              opacity: isCasting ? 0.45 : 1,
              paddingHorizontal: 16,
            }}
          >
            <View style={{ flex: 1, gap: 2, paddingVertical: 10 }}>
              <RelistenText selectable={false} style={{ fontWeight: '600' }}>
                Audio Adjustments
              </RelistenText>
              <RelistenText className="text-sm text-gray-400" selectable={false}>
                {configuration.enabled ? 'On for local playback' : 'Off — your settings are saved'}
              </RelistenText>
            </View>
            <View style={{ alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center' }}>
              <Switch
                accessibilityLabel="Audio Adjustments"
                disabled={isCasting}
                onValueChange={setEnabled}
                style={{ alignSelf: 'center' }}
                value={configuration.enabled}
              />
            </View>
          </View>
        </AudioAdjustmentSection>

        <AudioAdjustmentSection title="Equalizer">
          <AudioAdjustmentPresetMenu disabled={isCasting} />
          <View style={{ backgroundColor: RelistenBlue[800], height: 1 }} />
          <View style={{ gap: 8, opacity: isCasting ? 0.45 : 1, padding: 14 }}>
            <EqualizerResponseCurve gains={configuration.bandGainsDb} />
            <Pressable
              accessibilityRole="button"
              disabled={isCasting}
              onPress={() => router.push('/relisten/audio-adjustments/equalizer')}
              style={({ pressed }) => ({
                alignItems: 'center',
                borderColor: RelistenBlue[700],
                borderCurve: 'continuous',
                borderRadius: 12,
                borderWidth: 1,
                flexDirection: 'row',
                minHeight: 48,
                opacity: pressed ? 0.7 : 1,
                paddingHorizontal: 14,
              })}
            >
              <RelistenText selectable={false} style={{ flex: 1, fontWeight: '600' }}>
                Customize Equalizer
              </RelistenText>
              <Ionicons color={RelistenBlue[300]} name="chevron-forward" size={18} />
            </Pressable>
          </View>
        </AudioAdjustmentSection>

        <AudioAdjustmentSection title="Volume">
          <View style={{ gap: 6, opacity: isCasting ? 0.45 : 1, padding: 14 }}>
            <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'space-between' }}>
              <RelistenText selectable={false} style={{ flex: 1, fontWeight: '600', minWidth: 0 }}>
                Extra Volume Reduction
              </RelistenText>
              <RelistenText selectable={false} style={{ color: RelistenBlue[200], flexShrink: 0 }}>
                {reductionLabel(configuration.extraVolumeReductionDb)}
              </RelistenText>
            </View>
            <Slider
              accessibilityLabel="Extra Volume Reduction"
              accessibilityValue={{
                max: AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MAX_DB,
                min: AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MIN_DB,
                now: configuration.extraVolumeReductionDb,
                text: reductionLabel(configuration.extraVolumeReductionDb),
              }}
              disabled={isCasting}
              maximumTrackTintColor={RelistenBlue[800]}
              maximumValue={AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MAX_DB}
              minimumTrackTintColor={RelistenBlue[300]}
              minimumValue={AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MIN_DB}
              onSlidingComplete={finishAdjustment}
              onValueChange={setExtraVolumeReduction}
              step={1}
              thumbTintColor={colors.gray[50]}
              value={configuration.extraVolumeReductionDb}
            />
            <RelistenText className="text-sm text-gray-400" selectable={false}>
              Makes Relisten quieter than the iPhone volume control allows. This affects Relisten
              only.
            </RelistenText>
          </View>
        </AudioAdjustmentSection>

        <Pressable
          accessibilityRole="button"
          disabled={isCasting}
          onPress={() =>
            Alert.alert(
              'Reset Adjustments?',
              'This selects Flat, sets every band to 0 dB, and turns Extra Volume Reduction off. Audio Adjustments will keep its current On or Off state.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: reset },
              ]
            )
          }
          style={({ pressed }) => ({
            alignItems: 'center',
            borderColor: RelistenBlue[700],
            borderCurve: 'continuous',
            borderRadius: 12,
            borderWidth: 1,
            minHeight: 48,
            justifyContent: 'center',
            opacity: isCasting ? 0.45 : pressed ? 0.7 : 1,
            paddingHorizontal: 14,
          })}
        >
          <RelistenText selectable={false} style={{ fontWeight: '600' }}>
            Reset Adjustments…
          </RelistenText>
        </Pressable>

        <RelistenText selectable={false} className="text-center text-xs text-gray-500">
          Changes apply immediately and are saved on this iPhone.
        </RelistenText>
      </ScrollView>

      <Stack.Screen.Title>Audio Adjustments</Stack.Screen.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel="Close Audio Adjustments"
          icon="xmark"
          onPress={requestClose}
        />
      </Stack.Toolbar>
    </>
  );
}
