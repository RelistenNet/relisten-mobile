import {
  unsupportedAudioAdjustmentCapabilities,
  type AudioAdjustmentConfiguration,
} from '@/relisten/player/audio_adjustments/audio_adjustment_types';

const capabilities = unsupportedAudioAdjustmentCapabilities();

export const audioAdjustmentNative = {
  capabilities: () => capabilities,
  setConfiguration: (configuration: AudioAdjustmentConfiguration) => {
    void configuration;
  },
};
