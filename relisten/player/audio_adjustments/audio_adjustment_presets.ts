import {
  FLAT_AUDIO_ADJUSTMENT_BAND_GAINS,
  type AudioAdjustmentPreset,
} from '@/relisten/player/audio_adjustments/audio_adjustment_types';

export const BUILTIN_AUDIO_ADJUSTMENT_PRESETS = [
  {
    id: 'builtin:flat',
    name: 'Flat',
    subtitle: 'No equalization or extra volume reduction',
    bandGainsDb: FLAT_AUDIO_ADJUSTMENT_BAND_GAINS,
    extraVolumeReductionDb: 0,
  },
  {
    id: 'builtin:quiet-listening',
    name: 'Quiet Listening',
    subtitle: 'Makes Relisten quieter without changing tone',
    bandGainsDb: FLAT_AUDIO_ADJUSTMENT_BAND_GAINS,
    extraVolumeReductionDb: -18,
  },
  {
    id: 'builtin:tame-boom',
    name: 'Tame Boom',
    subtitle: 'Reduces bass-heavy audience recordings',
    bandGainsDb: [-6, -5, -4, -2, -1, 0, 0, 1, 1, 0],
    extraVolumeReductionDb: 0,
  },
  {
    id: 'builtin:vocal-clarity',
    name: 'Vocal Clarity',
    subtitle: 'Brings vocals and guitars forward',
    bandGainsDb: [-3, -3, -2, -1, 0, 1, 2, 2, 1, 0],
    extraVolumeReductionDb: 0,
  },
  {
    id: 'builtin:road-noise',
    name: 'Road Noise',
    subtitle: 'Adds bass and presence over road noise',
    bandGainsDb: [2, 3, 2, 0, -1, 0, 1, 2, 2, 1],
    extraVolumeReductionDb: 0,
  },
  {
    id: 'builtin:bone-conduction',
    name: 'Bone Conduction',
    subtitle: 'Reduces sub-bass, emphasizes mids, and lowers volume',
    bandGainsDb: [-4, -3, -1, 0, 1, 2, 2, 1, 0, -1],
    extraVolumeReductionDb: -12,
  },
] as const satisfies readonly AudioAdjustmentPreset[];
