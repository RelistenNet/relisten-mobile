import clsx from 'clsx';
import React from 'react';
import { TextProps } from 'react-native';
import { RelistenText } from './relisten_text';

interface NewProps {
  as?: React.ElementType;
  className?: string;
  children?: React.ReactNode;
}

const RowSubtitle = ({ className, as = RelistenText, ...props }: TextProps & NewProps) => {
  const Comp = as;

  return <Comp {...props} className={clsx('text-s text-slate-400', className)} />;
};

export default RowSubtitle;
