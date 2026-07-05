import {
  PLAYER_PANEL_BACKGROUND,
  PLAYER_PANEL_BORDER_COLOR,
  PLAYER_PANEL_ROW_BACKGROUND,
  PLAYER_PANEL_ROW_INSET,
  PLAYER_PANEL_ROW_RADIUS,
} from '@/relisten/player/ui/player_panel_theme';
import { type ReactNode } from 'react';
import { View } from 'react-native';

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
        paddingTop: isFirst ? 8 : 0,
        zIndex: 1,
      }}
    >
      <View
        style={{
          backgroundColor: PLAYER_PANEL_ROW_BACKGROUND,
          borderBottomLeftRadius: isLast ? PLAYER_PANEL_ROW_RADIUS : 0,
          borderBottomRightRadius: isLast ? PLAYER_PANEL_ROW_RADIUS : 0,
          borderBottomWidth: 1,
          borderColor: PLAYER_PANEL_BORDER_COLOR,
          borderCurve: 'continuous',
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderTopLeftRadius: isFirst ? PLAYER_PANEL_ROW_RADIUS : 0,
          borderTopRightRadius: isFirst ? PLAYER_PANEL_ROW_RADIUS : 0,
          borderTopWidth: isFirst ? 1 : 0,
          marginHorizontal: PLAYER_PANEL_ROW_INSET,
        }}
      >
        {children}
      </View>
    </View>
  );
}
