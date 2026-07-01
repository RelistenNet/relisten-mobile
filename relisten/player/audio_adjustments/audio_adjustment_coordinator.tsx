import { useAudioAdjustmentConfiguration } from '@/relisten/player/audio_adjustments/audio_adjustment_repo';
import { audioAdjustmentNative } from '@/relisten/player/audio_adjustments/audio_adjustment_native';
import { useEffect } from 'react';

export function AudioAdjustmentCoordinator() {
  const configuration = useAudioAdjustmentConfiguration();
  const bandGainsKey = configuration?.bandGainsDb.join(',');

  useEffect(() => {
    if (!configuration || !audioAdjustmentNative.capabilities().supported) {
      return;
    }

    audioAdjustmentNative.setConfiguration(configuration);
  }, [bandGainsKey, configuration?.enabled, configuration?.extraVolumeReductionDb]);

  return null;
}
