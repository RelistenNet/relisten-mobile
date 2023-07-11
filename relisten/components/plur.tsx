import plur from 'plur';

import React from 'react';

interface NewProps {
  as?: React.ElementType;
  cn?: string;
  center?: boolean;
  column?: boolean;
  full?: boolean;
  children?: React.ReactNode;
  word: string;
  plural?: string;
  count?: number;
}

const Plur = ({ word, plural, count }: NewProps) => {
  if (count === undefined) return '0 ' + word;
  const localized = Number(count).toLocaleString('en-US');

  if (plural) return localized + ' ' + plur(word, plural, count ?? 0);
  return localized + ' ' + plur(word, count);
};

export default Plur;
