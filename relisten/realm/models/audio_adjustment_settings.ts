import Realm from 'realm';

export const AUDIO_ADJUSTMENT_SETTINGS_SENTINEL = '__AUDIO_ADJUSTMENT_SETTINGS__';

export class AudioAdjustmentSettings extends Realm.Object<AudioAdjustmentSettings> {
  static schema: Realm.ObjectSchema = {
    name: 'AudioAdjustmentSettings',
    primaryKey: 'key',
    properties: {
      key: 'string',
      specVersion: 'int',
      enabled: 'bool',
      activePresetId: 'string?',
      bandGainsDb: 'double[]',
      extraVolumeReductionDb: 'double',
      updatedAt: 'date',
    },
  };

  key!: string;
  specVersion!: number;
  enabled!: boolean;
  activePresetId?: string;
  bandGainsDb!: Realm.List<number>;
  extraVolumeReductionDb!: number;
  updatedAt!: Date;
}

export class AudioAdjustmentPresetModel extends Realm.Object<AudioAdjustmentPresetModel> {
  static schema: Realm.ObjectSchema = {
    name: 'AudioAdjustmentPreset',
    primaryKey: 'id',
    properties: {
      id: 'string',
      specVersion: 'int',
      name: 'string',
      bandGainsDb: 'double[]',
      extraVolumeReductionDb: 'double',
      createdAt: 'date',
      updatedAt: 'date',
    },
  };

  id!: string;
  specVersion!: number;
  name!: string;
  bandGainsDb!: Realm.List<number>;
  extraVolumeReductionDb!: number;
  createdAt!: Date;
  updatedAt!: Date;
}
