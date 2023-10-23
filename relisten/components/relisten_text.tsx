import clsx from 'clsx';
import { PropsWithChildren } from 'react';
import { Text, TextProps } from 'react-native';

type Props = PropsWithChildren<TextProps> & { cn?: string };

export const RelistenText = ({ children, cn, ...props }: Props) => {
  return (
    <Text className={clsx('text-base text-white', cn)} selectable={true} {...props}>
      {children}
    </Text>
  );
};

export const UnselectableText = (props: Props) => <RelistenText selectable={false} {...props} />;
