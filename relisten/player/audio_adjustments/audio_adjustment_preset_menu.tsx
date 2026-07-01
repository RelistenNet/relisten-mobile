import { RelistenText } from '@/relisten/components/relisten_text';
import { BUILTIN_AUDIO_ADJUSTMENT_PRESETS } from '@/relisten/player/audio_adjustments/audio_adjustment_presets';
import { useAudioAdjustmentEditing } from '@/relisten/player/audio_adjustments/audio_adjustment_editing';
import { useCustomAudioAdjustmentPresets } from '@/relisten/player/audio_adjustments/audio_adjustment_repo';
import { useAudioAdjustmentStore } from '@/relisten/realm/root_services';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

const MANAGE_PRESETS_ACTION_ID = 'manage-presets';

export function AudioAdjustmentPresetMenu({ disabled = false }: { disabled?: boolean }) {
  const { activePresetId, selectPreset } = useAudioAdjustmentEditing();
  const store = useAudioAdjustmentStore();
  const customPresetModels = useCustomAudioAdjustmentPresets();
  const customPresetsKey = customPresetModels
    .map((model) => `${model.id}:${model.updatedAt.getTime()}`)
    .join('|');
  const customPresets = useMemo(
    () => customPresetModels.map((model) => store.preset(model.id)!).filter(Boolean),
    [customPresetModels, customPresetsKey, store]
  );
  const currentPreset = store.preset(activePresetId);
  const currentName = currentPreset?.name ?? 'Custom';

  const actions = useMemo<MenuAction[]>(() => {
    const builtins: MenuAction = {
      id: 'builtins',
      title: 'Built-in Presets',
      displayInline: true,
      subactions: BUILTIN_AUDIO_ADJUSTMENT_PRESETS.map((preset) => ({
        attributes: { disabled },
        id: preset.id,
        state: preset.id === activePresetId ? 'on' : 'off',
        title: preset.name,
      })),
    };
    const custom: MenuAction | undefined = customPresets.length
      ? {
          id: 'custom-presets',
          title: 'My Presets',
          displayInline: true,
          subactions: customPresets.map((preset) => ({
            attributes: { disabled },
            id: preset.id,
            state: preset.id === activePresetId ? 'on' : 'off',
            title: preset.name,
          })),
        }
      : undefined;

    return [
      builtins,
      ...(custom ? [custom] : []),
      {
        attributes: { disabled },
        id: MANAGE_PRESETS_ACTION_ID,
        image: 'slider.horizontal.3',
        title: 'Manage Presets…',
      },
    ];
  }, [activePresetId, customPresets, disabled]);

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        if (disabled) {
          return;
        }
        const actionId = nativeEvent.event;
        if (actionId === MANAGE_PRESETS_ACTION_ID) {
          router.push('/relisten/audio-adjustments/presets');
          return;
        }
        const preset = store.preset(actionId);
        if (preset) selectPreset(preset);
      }}
    >
      <Pressable
        accessibilityLabel={`Preset, ${currentName}`}
        accessibilityRole="button"
        disabled={disabled}
        style={({ pressed }) => ({
          alignItems: 'center',
          flexDirection: 'row',
          minHeight: 52,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
          paddingHorizontal: 16,
        })}
      >
        <View style={{ flex: 1, gap: 2, paddingVertical: 10 }}>
          <RelistenText selectable={false} style={{ fontWeight: '600' }}>
            Preset
          </RelistenText>
          {currentPreset?.subtitle && (
            <RelistenText className="text-xs text-gray-500" selectable={false}>
              {currentPreset.subtitle}
            </RelistenText>
          )}
        </View>
        <View
          style={{
            alignItems: 'center',
            alignSelf: 'stretch',
            flexDirection: 'row',
            gap: 6,
            justifyContent: 'flex-end',
            maxWidth: '50%',
            paddingLeft: 12,
          }}
        >
          <RelistenText
            className="text-right text-gray-400"
            numberOfLines={2}
            selectable={false}
            style={{ flexShrink: 1 }}
          >
            {currentName}
          </RelistenText>
          <Ionicons color={RelistenBlue[300]} name="chevron-forward" size={18} />
        </View>
      </Pressable>
    </MenuView>
  );
}
