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

export function PlayerAudioVisualizer({
  active = true,
  compact = false,
}: {
  active?: boolean;
  compact?: boolean;
}) {
  const playbackState = useRelistenPlayerPlaybackState();

  return (
    <NativeSpectrumView
      accessible={false}
      accessibilityElementsHidden
      active={active && playbackState === RelistenPlaybackState.Playing}
      color={RelistenBlue['200']}
      importantForAccessibility="no-hide-descendants"
      style={{ height: compact ? 10 : 16, width: '100%' }}
    />
  );
}
