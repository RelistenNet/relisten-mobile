import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { PropsWithChildren } from 'react';
import { useWindowDimensions, View } from 'react-native';

type AccountDetailRowProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
}>;

/** Keeps account actions clear of descriptive text, including at larger iOS text sizes. */
export function AccountDetailRow({ children, title, subtitle }: AccountDetailRowProps) {
  const { fontScale } = useWindowDimensions();
  const stacksAction = fontScale >= 1.25;

  return (
    <Flex className="w-full items-start" column={stacksAction}>
      <View className={stacksAction ? 'w-full' : 'min-w-0 flex-1'}>
        <RelistenText className="font-semibold">{title}</RelistenText>
        {subtitle && <RelistenText className="mt-1 text-sm text-gray-400">{subtitle}</RelistenText>}
      </View>
      {children && <View className={stacksAction ? 'mt-3' : 'ml-3 shrink-0'}>{children}</View>}
    </Flex>
  );
}
