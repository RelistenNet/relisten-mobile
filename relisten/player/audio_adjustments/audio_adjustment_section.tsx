import { RelistenText } from '@/relisten/components/relisten_text';
import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

export function AudioAdjustmentCard({ children }: PropsWithChildren) {
  return (
    <View
      className="overflow-hidden rounded-2xl border border-relisten-blue-200/15 bg-relisten-blue-900"
      style={{ borderCurve: 'continuous' }}
    >
      {children}
    </View>
  );
}

export function AudioAdjustmentSection({ children, title }: PropsWithChildren<{ title: string }>) {
  return (
    <View className="gap-2">
      <RelistenText
        className="text-[13px] font-bold tracking-[1.5px] text-relisten-blue-200"
        selectable={false}
      >
        {title.toUpperCase()}
      </RelistenText>
      <AudioAdjustmentCard>{children}</AudioAdjustmentCard>
    </View>
  );
}
