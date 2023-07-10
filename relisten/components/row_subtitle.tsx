import clsx from 'clsx';
import React from 'react';
import { Text, TextProps } from 'react-native';

interface NewProps {
  as?: React.ElementType;
  className?: string;
  children?: React.ReactNode;
}

const RowSubtitle = ({ className, as = Text, ...props }: TextProps & NewProps) => {
  const Comp = as;

  return <Comp {...props} className={clsx('text-s text-slate-400', className)} />;
};

export default RowSubtitle;
