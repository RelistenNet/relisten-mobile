import plur from 'plur';

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
  if (count === undefined) return '0\u00A0' + word;
  const localized = Number(count).toLocaleString('en-US');

  if (plural) return localized + '\u00A0' + plur(word, plural, count ?? 0);
  return localized + '\u00A0' + plur(word, count);
};

export default Plur;
