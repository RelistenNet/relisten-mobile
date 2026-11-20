import { requireNativeViewManager } from 'expo-modules-core';
import { type ComponentType } from 'react';
import { type ViewProps } from 'react-native';
import { RelistenBlue } from '@/relisten/relisten_blue';

type NativeSystemVolumeViewProps = ViewProps & { tint: string };

const NativeSystemVolumeView: ComponentType<NativeSystemVolumeViewProps> = requireNativeViewManager(
  'RelistenAudioPlayer',
  'RelistenSystemVolumeView'
);

/** iOS's own volume slider, for this phone or the AirPlay speaker it plays to. */
export function SystemVolumeSlider() {
  return <NativeSystemVolumeView tint={RelistenBlue['400']} style={{ flex: 1, height: 44 }} />;
}

export const hasSystemVolumeSlider = true;
