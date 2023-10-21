import { PropsWithChildren } from 'react';
import { PLAYBACK_SKELETON } from '../PlaybackBar';
import { View } from 'react-native';
import { useRelistenPlayerBottomBarContext } from '@/relisten/player/ui/player_bottom_bar';

export const ScrollScreen = ({ children }: PropsWithChildren) => {
  const { playerBottomBarHeight } = useRelistenPlayerBottomBarContext();

  return <View style={{ marginBottom: playerBottomBarHeight, flex: 1 }}>{children}</View>;
};
