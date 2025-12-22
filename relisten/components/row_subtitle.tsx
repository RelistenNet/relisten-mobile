import React from 'react';
import { TextProps } from 'react-native';
import { tw } from '../util/tw';
import Flex, { FlexProps } from './flex';
import { RelistenText } from './relisten_text';

interface NewProps {
  as?: React.ElementType;
  cn?: string;
  children?: React.ReactNode;
}

export const SubtitleRow = ({
  cn,
  className,
  as = Flex,
  ...props
}: TextProps & NewProps & FlexProps) => {
  const Comp = as;

  return <Comp {...props} cn={tw('pt-1 justify-between', className, cn)} numberOfLines={1} />;
};

export const SubtitleText = ({
  cn,
  className,
  as = RelistenText,
  numberOfLines,
  ...props
}: TextProps & NewProps) => {
  const Comp = as;

  return (
    <Comp
      className={tw('text-s text-gray-400', className, cn)}
      numberOfLines={numberOfLines || 2}
      {...props}
    />
  );
};
