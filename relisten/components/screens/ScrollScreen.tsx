import { useRelistenPlayerBottomBarContext } from '@/relisten/player/ui/player_bottom_bar';
import { PropsWithChildren } from 'react';
import { View } from 'react-native';

export const ScrollScreen = ({ children }: PropsWithChildren) => {
  const { playerBottomBarHeight } = useRelistenPlayerBottomBarContext();

  return <View style={{ marginBottom: playerBottomBarHeight, flex: 1 }}>{children}</View>;
};
