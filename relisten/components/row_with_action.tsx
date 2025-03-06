import { PropsWithChildren } from 'react';
import { ViewProps } from 'react-native';
import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';

export function RowWithAction({
  children,
  title,
  subtitle,
  ...props
}: { title: string; subtitle?: string } & PropsWithChildren<ViewProps>) {
  return (
    <Flex className="items-center justify-between" {...props}>
      <Flex column className="flex-shrink gap-1 pr-2">
        {title && <RelistenText className="font-semibold">{title}</RelistenText>}
        {subtitle && <RelistenText className="text-sm text-gray-400">{subtitle}</RelistenText>}
      </Flex>
      {children}
    </Flex>
  );
}
