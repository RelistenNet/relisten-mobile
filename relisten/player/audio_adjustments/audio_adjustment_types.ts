export const AUDIO_ADJUSTMENT_SPEC_VERSION = 1;

export const AUDIO_ADJUSTMENT_FREQUENCIES_HZ = [
  31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
] as const;

export const AUDIO_ADJUSTMENT_BAND_GAIN_MIN_DB = -12;
export const AUDIO_ADJUSTMENT_BAND_GAIN_MAX_DB = 12;
export const AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MIN_DB = -30;
export const AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MAX_DB = 0;

export type AudioAdjustmentBandGains = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const FLAT_AUDIO_ADJUSTMENT_BAND_GAINS: AudioAdjustmentBandGains = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

export type AudioAdjustmentConfiguration = {
  bandGainsDb: AudioAdjustmentBandGains;
  enabled: boolean;
  extraVolumeReductionDb: number;
  specVersion: number;
};

export type AudioAdjustmentCapabilities = {
  bandGainMaximumDb: number;
  bandGainMinimumDb: number;
  frequenciesHz: number[];
  specVersion: number;
  supported: boolean;
  volumeReductionMaximumDb: number;
  volumeReductionMinimumDb: number;
};

export type AudioAdjustmentPreset = {
  bandGainsDb: AudioAdjustmentBandGains;
  extraVolumeReductionDb: number;
  id: string;
  name: string;
  subtitle?: string;
};

export function unsupportedAudioAdjustmentCapabilities(): AudioAdjustmentCapabilities {
  return {
    bandGainMaximumDb: AUDIO_ADJUSTMENT_BAND_GAIN_MAX_DB,
    bandGainMinimumDb: AUDIO_ADJUSTMENT_BAND_GAIN_MIN_DB,
    frequenciesHz: [...AUDIO_ADJUSTMENT_FREQUENCIES_HZ],
    specVersion: AUDIO_ADJUSTMENT_SPEC_VERSION,
    supported: false,
    volumeReductionMaximumDb: AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MAX_DB,
    volumeReductionMinimumDb: AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MIN_DB,
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function normalizeAudioAdjustmentBandGains(
  values: readonly number[] | undefined
): AudioAdjustmentBandGains {
  if (
    values?.length !== AUDIO_ADJUSTMENT_FREQUENCIES_HZ.length ||
    values.some((value) => !Number.isFinite(value))
  ) {
    return [...FLAT_AUDIO_ADJUSTMENT_BAND_GAINS];
  }

  return values.map((value) =>
    clamp(value, AUDIO_ADJUSTMENT_BAND_GAIN_MIN_DB, AUDIO_ADJUSTMENT_BAND_GAIN_MAX_DB)
  ) as AudioAdjustmentBandGains;
}

export function normalizeAudioAdjustmentConfiguration(configuration: {
  bandGainsDb?: readonly number[];
  enabled?: boolean;
  extraVolumeReductionDb?: number;
  specVersion?: number;
}): AudioAdjustmentConfiguration {
  const requestedVolumeReductionDb = configuration.extraVolumeReductionDb;
  const extraVolumeReductionDb =
    typeof requestedVolumeReductionDb === 'number' && Number.isFinite(requestedVolumeReductionDb)
      ? clamp(
          requestedVolumeReductionDb,
          AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MIN_DB,
          AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MAX_DB
        )
      : AUDIO_ADJUSTMENT_VOLUME_REDUCTION_MAX_DB;

  return {
    bandGainsDb: normalizeAudioAdjustmentBandGains(configuration.bandGainsDb),
    enabled: configuration.enabled ?? false,
    extraVolumeReductionDb,
    specVersion: AUDIO_ADJUSTMENT_SPEC_VERSION,
  };
}
