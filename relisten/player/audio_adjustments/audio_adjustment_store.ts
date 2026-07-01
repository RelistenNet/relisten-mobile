import {
  AUDIO_ADJUSTMENT_SETTINGS_SENTINEL,
  AudioAdjustmentPresetModel,
  AudioAdjustmentSettings,
} from '@/relisten/realm/models/audio_adjustment_settings';
import { BUILTIN_AUDIO_ADJUSTMENT_PRESETS } from '@/relisten/player/audio_adjustments/audio_adjustment_presets';
import {
  AUDIO_ADJUSTMENT_SPEC_VERSION,
  FLAT_AUDIO_ADJUSTMENT_BAND_GAINS,
  normalizeAudioAdjustmentConfiguration,
  type AudioAdjustmentConfiguration,
  type AudioAdjustmentPreset,
} from '@/relisten/player/audio_adjustments/audio_adjustment_types';
import * as Crypto from 'expo-crypto';
import Realm from 'realm';

export class AudioAdjustmentStore {
  constructor(private readonly realm: Realm.Realm) {
    this.ensureSettings();
  }

  currentSettings() {
    return this.ensureSettings();
  }

  currentConfiguration(): AudioAdjustmentConfiguration {
    const settings = this.ensureSettings();

    return normalizeAudioAdjustmentConfiguration({
      bandGainsDb: Array.from(settings.bandGainsDb),
      enabled: settings.enabled,
      extraVolumeReductionDb: settings.extraVolumeReductionDb,
      specVersion: settings.specVersion,
    });
  }

  preset(id: string | null | undefined): AudioAdjustmentPreset | undefined {
    const builtin = BUILTIN_AUDIO_ADJUSTMENT_PRESETS.find((candidate) => candidate.id === id);
    if (builtin) {
      return builtin;
    }

    if (!id?.startsWith('custom:')) {
      return undefined;
    }

    const model = this.realm.objectForPrimaryKey(AudioAdjustmentPresetModel, id);
    return model ? this.presetFromModel(model) : undefined;
  }

  setConfiguration(configuration: AudioAdjustmentConfiguration, activePresetId?: string | null) {
    const normalized = normalizeAudioAdjustmentConfiguration(configuration);
    const settings = this.ensureSettings();

    this.realm.write(() => {
      settings.specVersion = normalized.specVersion;
      settings.enabled = normalized.enabled;
      settings.activePresetId = activePresetId ?? undefined;
      settings.bandGainsDb.splice(0, settings.bandGainsDb.length, ...normalized.bandGainsDb);
      settings.extraVolumeReductionDb = normalized.extraVolumeReductionDb;
      settings.updatedAt = new Date();
    });

    return normalized;
  }

  selectPreset(preset: AudioAdjustmentPreset) {
    const current = this.currentConfiguration();
    return this.setConfiguration(
      {
        ...current,
        bandGainsDb: [...preset.bandGainsDb],
        extraVolumeReductionDb: preset.extraVolumeReductionDb,
      },
      preset.id
    );
  }

  savePreset(name: string, configuration: AudioAdjustmentConfiguration) {
    const normalizedName = this.validateName(name);
    const normalized = normalizeAudioAdjustmentConfiguration(configuration);
    const now = new Date();
    const id = `custom:${Crypto.randomUUID()}`;

    this.realm.write(() => {
      this.realm.create(AudioAdjustmentPresetModel, {
        id,
        specVersion: AUDIO_ADJUSTMENT_SPEC_VERSION,
        name: normalizedName,
        bandGainsDb: normalized.bandGainsDb,
        extraVolumeReductionDb: normalized.extraVolumeReductionDb,
        createdAt: now,
        updatedAt: now,
      });
    });

    const preset = this.preset(id)!;
    this.setConfiguration(normalized, id);
    return preset;
  }

  updatePreset(id: string, configuration: AudioAdjustmentConfiguration) {
    const model = this.realm.objectForPrimaryKey(AudioAdjustmentPresetModel, id);
    if (!model) {
      throw new Error('The preset no longer exists.');
    }

    const normalized = normalizeAudioAdjustmentConfiguration(configuration);
    this.realm.write(() => {
      model.specVersion = AUDIO_ADJUSTMENT_SPEC_VERSION;
      model.bandGainsDb.splice(0, model.bandGainsDb.length, ...normalized.bandGainsDb);
      model.extraVolumeReductionDb = normalized.extraVolumeReductionDb;
      model.updatedAt = new Date();
    });
    this.setConfiguration(normalized, id);
  }

  renamePreset(id: string, name: string) {
    const model = this.realm.objectForPrimaryKey(AudioAdjustmentPresetModel, id);
    if (!model) {
      return;
    }

    const normalizedName = this.validateName(name);
    this.realm.write(() => {
      model.name = normalizedName;
      model.updatedAt = new Date();
    });
  }

  deletePreset(id: string) {
    const model = this.realm.objectForPrimaryKey(AudioAdjustmentPresetModel, id);
    if (!model) {
      return;
    }

    const settings = this.ensureSettings();
    this.realm.write(() => {
      if (settings.activePresetId === id) {
        settings.activePresetId = undefined;
        settings.updatedAt = new Date();
      }
      this.realm.delete(model);
    });
  }

  reset() {
    const current = this.currentConfiguration();
    const flat = BUILTIN_AUDIO_ADJUSTMENT_PRESETS[0];
    return this.setConfiguration(
      {
        ...current,
        bandGainsDb: [...FLAT_AUDIO_ADJUSTMENT_BAND_GAINS],
        extraVolumeReductionDb: 0,
      },
      flat.id
    );
  }

  private ensureSettings() {
    const existing = this.realm.objectForPrimaryKey(
      AudioAdjustmentSettings,
      AUDIO_ADJUSTMENT_SETTINGS_SENTINEL
    );
    if (existing) {
      return existing;
    }

    return this.realm.write(() =>
      this.realm.create(AudioAdjustmentSettings, {
        key: AUDIO_ADJUSTMENT_SETTINGS_SENTINEL,
        specVersion: AUDIO_ADJUSTMENT_SPEC_VERSION,
        enabled: false,
        activePresetId: BUILTIN_AUDIO_ADJUSTMENT_PRESETS[0].id,
        bandGainsDb: [...FLAT_AUDIO_ADJUSTMENT_BAND_GAINS],
        extraVolumeReductionDb: 0,
        updatedAt: new Date(),
      })
    );
  }

  private presetFromModel(model: AudioAdjustmentPresetModel): AudioAdjustmentPreset {
    const configuration = normalizeAudioAdjustmentConfiguration({
      bandGainsDb: Array.from(model.bandGainsDb),
      extraVolumeReductionDb: model.extraVolumeReductionDb,
    });

    return {
      id: model.id,
      name: model.name,
      bandGainsDb: configuration.bandGainsDb,
      extraVolumeReductionDb: configuration.extraVolumeReductionDb,
    };
  }

  private validateName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Enter a preset name.');
    }
    if (trimmed.length > 40) {
      throw new Error('Preset names must be 40 characters or fewer.');
    }
    return trimmed;
  }
}
