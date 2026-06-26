import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { useRelistenPlayerPlaybackState } from '@/relisten/player/relisten_player_hooks';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { requireNativeViewManager } from 'expo-modules-core';
import { type ComponentType } from 'react';
import { type ViewProps } from 'react-native';

type NativeSpectrumViewProps = ViewProps & {
  active: boolean;
  color: string;
};

const NativeSpectrumView: ComponentType<NativeSpectrumViewProps> =
  requireNativeViewManager('RelistenAudioPlayer');

export function PlayerAudioVisualizer() {
  const playbackState = useRelistenPlayerPlaybackState();

  return (
    <NativeSpectrumView
      accessible={false}
      accessibilityElementsHidden
      active={playbackState === RelistenPlaybackState.Playing}
      color={RelistenBlue['200']}
      importantForAccessibility="no-hide-descendants"
      style={{ aspectRatio: 5.5, width: '100%' }}
    />
  );
}
