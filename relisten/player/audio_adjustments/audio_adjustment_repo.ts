import {
  AUDIO_ADJUSTMENT_SETTINGS_SENTINEL,
  AudioAdjustmentPresetModel,
  AudioAdjustmentSettings,
} from '@/relisten/realm/models/audio_adjustment_settings';
import { useObject, useQuery } from '@/relisten/realm/schema';
import { normalizeAudioAdjustmentConfiguration } from '@/relisten/player/audio_adjustments/audio_adjustment_types';

export function useAudioAdjustmentSettings() {
  return useObject(AudioAdjustmentSettings, AUDIO_ADJUSTMENT_SETTINGS_SENTINEL, [
    'specVersion',
    'enabled',
    'activePresetId',
    'bandGainsDb',
    'extraVolumeReductionDb',
    'updatedAt',
  ]);
}

export function useCustomAudioAdjustmentPresets() {
  return useQuery(AudioAdjustmentPresetModel, (presets) =>
    presets.sorted([
      ['name', false],
      ['createdAt', false],
    ])
  );
}

export function useAudioAdjustmentConfiguration() {
  const settings = useAudioAdjustmentSettings();

  return settings
    ? normalizeAudioAdjustmentConfiguration({
        bandGainsDb: Array.from(settings.bandGainsDb),
        enabled: settings.enabled,
        extraVolumeReductionDb: settings.extraVolumeReductionDb,
        specVersion: settings.specVersion,
      })
    : undefined;
}
