import { RelistenBlue } from '@/relisten/relisten_blue';
import { type ReactNode } from 'react';
import { View } from 'react-native';

export const PLAYER_PANEL_BACKGROUND = RelistenBlue['800'];
export const PLAYER_PANEL_ROW_BACKGROUND = RelistenBlue['900'];

type PlayerPanelRowProps = {
  children: ReactNode;
  isFirst: boolean;
  isLast: boolean;
};

export function PlayerPanelRow({ children, isFirst, isLast }: PlayerPanelRowProps) {
  return (
    <View
      style={{
        backgroundColor: PLAYER_PANEL_BACKGROUND,
        borderBottomLeftRadius: isLast ? 28 : 0,
        borderBottomRightRadius: isLast ? 28 : 0,
        borderBottomWidth: isLast ? 1 : 0,
        borderColor: 'rgba(60, 219, 255, 0.3)',
        borderCurve: 'continuous',
        borderLeftWidth: 1,
        borderRightWidth: 1,
        paddingBottom: isLast ? 16 : 0,
        paddingTop: isFirst ? 8 : 0,
        zIndex: 1,
      }}
    >
      <View
        style={{
          backgroundColor: PLAYER_PANEL_ROW_BACKGROUND,
          borderBottomLeftRadius: isLast ? 16 : 0,
          borderBottomRightRadius: isLast ? 16 : 0,
          borderBottomWidth: 1,
          borderColor: 'rgba(60, 219, 255, 0.16)',
          borderCurve: 'continuous',
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderTopLeftRadius: isFirst ? 16 : 0,
          borderTopRightRadius: isFirst ? 16 : 0,
          borderTopWidth: isFirst ? 1 : 0,
          marginHorizontal: 8,
        }}
      >
        {children}
      </View>
    </View>
  );
}
