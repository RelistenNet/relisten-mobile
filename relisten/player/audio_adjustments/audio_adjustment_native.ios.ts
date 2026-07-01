import RelistenAudioPlayerModule from '@/modules/relisten-audio-player/src/RelistenAudioPlayerModule';
import {
  AUDIO_ADJUSTMENT_SPEC_VERSION,
  unsupportedAudioAdjustmentCapabilities,
  type AudioAdjustmentCapabilities,
  type AudioAdjustmentConfiguration,
} from '@/relisten/player/audio_adjustments/audio_adjustment_types';

type AudioAdjustmentNativeModule = {
  audioAdjustmentCapabilities(): AudioAdjustmentCapabilities;
  setAudioAdjustmentConfiguration(configuration: AudioAdjustmentConfiguration): void;
};

const nativeModule = RelistenAudioPlayerModule as Partial<AudioAdjustmentNativeModule>;
const nativeCapabilities = nativeModule.audioAdjustmentCapabilities?.();
const capabilities =
  nativeCapabilities?.specVersion === AUDIO_ADJUSTMENT_SPEC_VERSION
    ? nativeCapabilities
    : unsupportedAudioAdjustmentCapabilities();

export const audioAdjustmentNative = {
  capabilities: () => capabilities,
  setConfiguration: (configuration: AudioAdjustmentConfiguration) => {
    nativeModule.setAudioAdjustmentConfiguration?.(configuration);
  },
};
