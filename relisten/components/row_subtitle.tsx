import clsx from 'clsx';
import React from 'react';
import { TextProps } from 'react-native';
import Flex from './flex';
import { RelistenText } from './relisten_text';

interface NewProps {
  as?: React.ElementType;
  cn?: string;
  children?: React.ReactNode;
}

export const SubtitleRow = ({ cn, style, as = Flex, ...props }: TextProps & NewProps) => {
  const Comp = as;

  return <Comp {...props} cn={clsx('pt-1 justify-between', cn)} numberOfLines={1} />;
};

export const SubtitleText = ({ cn, style, as = RelistenText, ...props }: TextProps & NewProps) => {
  const Comp = as;

  return <Comp {...props} cn={clsx('text-s text-gray-400', cn)} numberOfLines={1} />;
};
