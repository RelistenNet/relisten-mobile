import { useRelistenPlayerBottomBarContext } from '@/relisten/player/ui/player_bottom_bar';
import { PropsWithChildren } from 'react';
import { View } from 'react-native';

type ScrollScreenProps = PropsWithChildren<{
  reserveBottomInset?: boolean;
}>;

export const ScrollScreen = ({ children, reserveBottomInset = true }: ScrollScreenProps) => {
  const { collapsedSheetFootprint } = useRelistenPlayerBottomBarContext();

  return (
    <View style={{ paddingBottom: reserveBottomInset ? collapsedSheetFootprint : 0, flex: 1 }}>
      {children}
    </View>
  );
};
