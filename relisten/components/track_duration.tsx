import { RelistenText } from '@/relisten/components/relisten_text';
import { tw } from '@/relisten/util/tw';
import { View } from 'react-native';

/**
 * A track's duration in a right-aligned column at least as wide as "00:00",
 * so the offline mark and other controls beside it line up from row to row.
 * The width comes from an invisible "00:00" in the same font, so it follows
 * text size; an hour-long duration simply widens its own row's column.
 */
export function TrackDuration({
  duration,
  className,
}: {
  duration: string | undefined;
  className?: string;
}) {
  const textClassName = tw('text-base text-gray-400', className);

  return (
    <View className="items-end">
      <RelistenText
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className={textClassName}
        selectable={false}
        style={{ height: 0, opacity: 0 }}
      >
        00:00
      </RelistenText>
      <RelistenText className={textClassName} selectable={false}>
        {duration}
      </RelistenText>
    </View>
  );
}
