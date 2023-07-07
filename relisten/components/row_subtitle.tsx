import clsx from 'clsx';
import React from 'react';
import { Text } from 'react-native';

interface NewProps {
  as?: React.ElementType;
  className?: string;
  children?: React.ReactNode;
}

const RowSubtitle = ({
  className,
  as = Text,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & NewProps) => {
  const Comp = as;

  return <Comp {...props} className={clsx('text-slate-700 text-xs', className)} />;
};

export default RowSubtitle;
