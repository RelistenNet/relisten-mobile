import { OverflowMenuTrigger } from '@/relisten/components/menus/overflow_menu_trigger';
import { RelistenText } from '@/relisten/components/relisten_text';
import { useAudioAdjustmentEditing } from '@/relisten/player/audio_adjustments/audio_adjustment_editing';
import { useCustomAudioAdjustmentPresets } from '@/relisten/player/audio_adjustments/audio_adjustment_repo';
import { useAudioAdjustmentStore } from '@/relisten/realm/root_services';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { MenuView, type MenuAction } from '@expo/ui/community/menu';
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
        contentContainerStyle={{ gap: 16, padding: 16, paddingBottom: 36 }}
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: RelistenBlue[950], flex: 1 }}
      >
        {presets.length === 0 ? (
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 48 }}>
            <RelistenText selectable={false} style={{ fontSize: 20, fontWeight: '700' }}>
              No Saved Presets
            </RelistenText>
            <RelistenText className="text-center text-gray-400" selectable={false}>
              Customize the equalizer, then save the changes when closing Audio Adjustments.
            </RelistenText>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: RelistenBlue[900],
              borderColor: RelistenBlue[800],
              borderCurve: 'continuous',
              borderRadius: 16,
              borderWidth: 1,
              overflow: 'hidden',
            }}
          >
            {presets.map((preset, index) => (
              <View key={preset.id}>
                {index > 0 && <View style={{ backgroundColor: RelistenBlue[800], height: 1 }} />}
                <View
                  style={{ alignItems: 'center', flexDirection: 'row', minHeight: 58, padding: 14 }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <RelistenText selectable={false} style={{ fontWeight: '600' }}>
                      {preset.name}
                    </RelistenText>
                    <RelistenText className="text-sm text-gray-400" selectable={false}>
                      {preset.extraVolumeReductionDb === 0
                        ? 'No extra volume reduction'
                        : `${preset.extraVolumeReductionDb} dB volume reduction`}
                    </RelistenText>
                  </View>
                  <MenuView
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
                    <OverflowMenuTrigger
                      accessibilityLabel={`Actions for ${preset.name}`}
                      tone="muted"
                    />
                  </MenuView>
                </View>
              </View>
            ))}
          </View>
        )}
        <RelistenText className="text-center text-xs text-gray-500" selectable={false}>
          Preset names do not need to be unique.
        </RelistenText>
      </ScrollView>
      <Stack.Screen.Title>Manage Presets</Stack.Screen.Title>
    </>
  );
}
