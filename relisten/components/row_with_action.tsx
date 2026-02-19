import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { tw } from '@/relisten/util/tw';
import clsx from 'clsx';
import { PropsWithChildren } from 'react';
import { ViewProps } from 'react-native';

export function RowWithAction({
  children,
  title,
  subtitle,
  className,
  warnOnEnable,
  ...props
}: { title: string; subtitle?: string; warnOnEnable?: boolean } & PropsWithChildren<ViewProps>) {
  return (
    <Flex column>
      <Flex className={tw('w-full items-center justify-between', className)} {...props}>
        <Flex column className="flex-shrink gap-1 pr-2">
          {title && <RelistenText className="font-semibold">{title}</RelistenText>}
          {subtitle && (
            <RelistenText
              className={clsx('text-sm text-gray-400', {
                ['text-amber-500 italic font-semibold']: !!warnOnEnable,
              })}
            >
              {subtitle}
            </RelistenText>
          )}
        </Flex>
        {children}
      </Flex>
    </Flex>
  );
}
