import { RelistenText } from '@/relisten/components/relisten_text';
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
          backgroundColor: RelistenBlue[900],
          borderColor: RelistenBlue[800],
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
