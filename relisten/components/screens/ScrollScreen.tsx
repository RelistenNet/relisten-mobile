import { useRelistenPlayerBottomBarContext } from '@/relisten/player/ui/player_bottom_bar';
import { PropsWithChildren } from 'react';
import { View } from 'react-native';

export const ScrollScreen = ({ children }: PropsWithChildren) => {
  const { collapsedSheetFootprint } = useRelistenPlayerBottomBarContext();

  return <View style={{ paddingBottom: collapsedSheetFootprint, flex: 1 }}>{children}</View>;
};
