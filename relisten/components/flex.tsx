import clsx from 'clsx';
import React from 'react';
import { View } from 'react-native';

interface NewProps {
  as?: React.ElementType;
  className?: string;
  center?: boolean;
  column?: boolean;
  full?: boolean;
  children?: React.ReactNode;
}

const Flex = ({
  className,
  center,
  column,
  as = View,
  full,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & NewProps) => {
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
        className
      )}
    />
  );
};

export default Flex;
