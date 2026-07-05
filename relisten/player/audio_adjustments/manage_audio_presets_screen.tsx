import { NativeMenuView, type MenuAction } from '@/relisten/components/menus/native_menu_view';
import { OverflowMenuTrigger } from '@/relisten/components/menus/overflow_menu_trigger';
import { RelistenText } from '@/relisten/components/relisten_text';
import { AudioAdjustmentCard } from '@/relisten/player/audio_adjustments/audio_adjustment_section';
import { useAudioAdjustmentEditing } from '@/relisten/player/audio_adjustments/audio_adjustment_editing';
import { useCustomAudioAdjustmentPresets } from '@/relisten/player/audio_adjustments/audio_adjustment_repo';
import { useAudioAdjustmentStore } from '@/relisten/realm/root_services';
import { Stack } from 'expo-router';
import { Alert, ScrollView, View } from 'react-native';

const PRESET_ACTION_IDS = {
  delete: 'delete',
  rename: 'rename',
} as const;

type PresetActionId = (typeof PRESET_ACTION_IDS)[keyof typeof PRESET_ACTION_IDS];

const PRESET_ACTIONS: MenuAction[] = [
  { id: PRESET_ACTION_IDS.rename, image: 'pencil', title: 'Rename' },
  {
    id: PRESET_ACTION_IDS.delete,
    image: 'trash',
    title: 'Delete',
    attributes: { destructive: true },
  },
];

export function ManageAudioPresetsScreen() {
  const store = useAudioAdjustmentStore();
  const { deletePreset } = useAudioAdjustmentEditing();
  const presets = useCustomAudioAdjustmentPresets();

  return (
    <>
      <ScrollView
        className="flex-1 bg-relisten-blue-950"
        contentContainerStyle={{ gap: 16, padding: 16, paddingBottom: 36 }}
        contentInsetAdjustmentBehavior="automatic"
      >
        {presets.length === 0 ? (
          <View className="items-center gap-2 py-12">
            <RelistenText className="text-xl font-bold" selectable={false}>
              No Saved Presets
            </RelistenText>
            <RelistenText className="text-center text-gray-400" selectable={false}>
              Customize the equalizer, then save the changes when closing Audio Equalizer.
            </RelistenText>
          </View>
        ) : (
          <AudioAdjustmentCard>
            {presets.map((preset, index) => (
              <View key={preset.id}>
                {index > 0 && <View className="h-px bg-relisten-blue-200/10" />}
                <View className="min-h-[58px] flex-row items-center p-3.5">
                  <View className="flex-1 gap-0.5">
                    <RelistenText className="font-semibold" selectable={false}>
                      {preset.name}
                    </RelistenText>
                    <RelistenText className="text-sm text-gray-400" selectable={false}>
                      {preset.extraVolumeReductionDb === 0
                        ? 'No extra volume reduction'
                        : `${preset.extraVolumeReductionDb} dB volume reduction`}
                    </RelistenText>
                  </View>
                  <NativeMenuView
                    actions={PRESET_ACTIONS}
                    onPressAction={({ nativeEvent }) => {
                      const actionId = nativeEvent.event as PresetActionId;
                      if (actionId === PRESET_ACTION_IDS.rename) {
                        Alert.prompt(
                          'Rename Preset',
                          'Preset names may be reused.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Save',
                              onPress: (name?: string) => {
                                const presetName = name ?? '';
                                try {
                                  store.renamePreset(preset.id, presetName);
                                } catch (error) {
                                  Alert.alert('Could Not Rename Preset', String(error));
                                }
                              },
                            },
                          ],
                          'plain-text',
                          preset.name
                        );
                      } else if (actionId === PRESET_ACTION_IDS.delete) {
                        Alert.alert('Delete Preset?', `Delete “${preset.name}”?`, [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => deletePreset(preset.id),
                          },
                        ]);
                      }
                    }}
                  >
                    <OverflowMenuTrigger accessibilityLabel={`Actions for ${preset.name}`} />
                  </NativeMenuView>
                </View>
              </View>
            ))}
          </AudioAdjustmentCard>
        )}
        <RelistenText className="text-center text-xs text-gray-500" selectable={false}>
          Preset names do not need to be unique.
        </RelistenText>
      </ScrollView>
      <Stack.Screen.Title>Manage Presets</Stack.Screen.Title>
    </>
  );
}
