import { tw } from '@/relisten/util/tw';
import { type ReactNode } from 'react';
import { View } from 'react-native';

type PlayerPanelRowProps = {
  children: ReactNode;
  isFirst: boolean;
  isLast: boolean;
};

export function PlayerPanelRow({ children, isFirst, isLast }: PlayerPanelRowProps) {
  return (
    <View className={tw('z-10 bg-relisten-blue-900', isFirst && 'pt-2')}>
      <View
        className={tw(
          'mx-2 border-x border-b border-relisten-blue-500/15 bg-relisten-blue-950',
          isFirst && 'rounded-t-2xl border-t',
          isLast && 'rounded-b-2xl'
        )}
        style={{ borderCurve: 'continuous' }}
      >
        {children}
      </View>
    </View>
  );
}
