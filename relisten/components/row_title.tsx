import React from 'react';
import { Text, TextProps } from 'react-native';
import { tw } from '@/relisten/util/tw';

interface NewProps {
  as?: React.ElementType;
  className?: string;
  children?: React.ReactNode;
}

const RowTitle = ({ className, as = Text, ...props }: TextProps & NewProps) => {
  const Comp = as;

  return (
    <Comp
      {...props}
      className={tw('numb shrink text-lg font-semibold text-white', className)}
      style={{ fontVariant: ['tabular-nums'] }}
    />
  );
};

export default RowTitle;
