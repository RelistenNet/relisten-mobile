import clsx from 'clsx';
import React from 'react';
import { View, ViewProps } from 'react-native';

interface NewProps {
  as?: React.ElementType;
  cn?: string;
  center?: boolean;
  column?: boolean;
  full?: boolean;
  children?: React.ReactNode;
}

const Flex = ({ cn, center, column, as = View, full, ...props }: ViewProps & NewProps) => {
  const Comp = as;

  return (
    <Comp
      {...props}
      className={clsx(
        'flex',
        {
          'flex-row': !column,
          'flex-col': column,
          'justify-center': center,
          'items-center': center,
          'w-full': full,
        },
        cn
      )}
    />
  );
};

export default Flex;
