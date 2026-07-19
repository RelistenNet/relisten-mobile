import { RelistenText } from '@/relisten/components/relisten_text';
import { tw } from '@/relisten/util/tw';

export function UnavailableFavoritesNotice({
  className,
  count,
}: {
  className?: string;
  count: number;
}) {
  if (count === 0) {
    return null;
  }

  return (
    <RelistenText className={tw('text-sm text-gray-400', className)}>
      {count === 1
        ? "1 saved favorite isn't currently available. It remains saved and may return."
        : `${count} saved favorites aren't currently available. They remain saved and may return.`}
    </RelistenText>
  );
}
