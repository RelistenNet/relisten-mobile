import { FunctionComponent, PropsWithChildren } from 'react';
import { TextProps } from 'react-native';
import { RelistenText } from './relisten_text';

export const Tag: FunctionComponent<PropsWithChildren<{ value?: string } & TextProps>> = ({
  value,
  children,
  ...props
}) => {
  return (
    <RelistenText className="rounded-lg bg-relisten-blue-800 p-1" {...props}>
      {value ? value : children}
    </RelistenText>
  );
};
