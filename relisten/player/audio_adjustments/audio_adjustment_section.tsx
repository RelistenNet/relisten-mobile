import { RelistenText } from '@/relisten/components/relisten_text';
import {
  PLAYER_PANEL_BACKGROUND,
  PLAYER_PANEL_BORDER_COLOR,
} from '@/relisten/player/ui/player_panel_theme';
import { RelistenBlue } from '@/relisten/relisten_blue';
import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

export function AudioAdjustmentSection({ children, title }: PropsWithChildren<{ title: string }>) {
  return (
    <View style={{ gap: 8 }}>
      <RelistenText
        selectable={false}
        style={{
          color: RelistenBlue[200],
          fontSize: 13,
          fontWeight: '700',
          letterSpacing: 1.5,
        }}
      >
        {title.toUpperCase()}
      </RelistenText>
      <View
        style={{
          backgroundColor: PLAYER_PANEL_BACKGROUND,
          borderColor: PLAYER_PANEL_BORDER_COLOR,
          borderCurve: 'continuous',
          borderRadius: 16,
          borderWidth: 1,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}
