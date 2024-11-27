import React from 'react';
import { TextProps } from 'react-native';
import { tw } from '../util/tw';
import Flex from './flex';
import { RelistenText } from './relisten_text';

interface NewProps {
  as?: React.ElementType;
  cn?: string;
  children?: React.ReactNode;
}

export const SubtitleRow = ({
  cn,
  className,
  style,
  as = Flex,
  ...props
}: TextProps & NewProps) => {
  const Comp = as;

  return <Comp {...props} cn={tw('pt-1 justify-between', className, cn)} numberOfLines={1} />;
};

export const SubtitleText = ({
  cn,
  className,
  style,
  as = RelistenText,
  ...props
}: TextProps & NewProps) => {
  const Comp = as;

  return (
    <Comp className={tw('text-s text-gray-400', className, cn)} numberOfLines={2} {...props} />
  );
};
