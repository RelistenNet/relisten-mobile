import clsx from 'clsx';
import React from 'react';
import { Text } from 'react-native';

interface NewProps {
  as?: React.ElementType;
  className?: string;
  children?: React.ReactNode;
}

const RowTitle = ({
  className,
  as = Text,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & NewProps) => {
  const Comp = as;

  return <Comp {...props} className={clsx('font-semibold text-lg dark:text-white', className)} />;
};

export default RowTitle;
