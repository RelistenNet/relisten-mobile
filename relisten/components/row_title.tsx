import clsx from 'clsx';
import React from 'react';
import { Text, TextProps } from 'react-native';

interface NewProps {
  as?: React.ElementType;
  className?: string;
  children?: React.ReactNode;
}

const RowTitle = ({ className, as = Text, ...props }: TextProps & NewProps) => {
  const Comp = as;

  return <Comp {...props} className={clsx('text-lg font-semibold text-white', className)} />;
};

export default RowTitle;
