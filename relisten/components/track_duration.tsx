import { RelistenText } from '@/relisten/components/relisten_text';
import { View } from 'react-native';

/**
 * A track's duration (or a time of day) in a right-aligned column at least as
 * wide as `widest`, so the offline mark and other controls beside it line up
 * from row to row. The width comes from an invisible copy of `widest` in the
 * same font, so it follows text size; a longer value simply widens its own row.
 */
export function TrackDuration({
  duration,
  small = false,
  widest = '00:00',
}: {
  duration: string | undefined;
  /** The smaller grey used for times beside history entries. */
  small?: boolean;
  /** The text whose width the column reserves, e.g. "00:00 AM" for a time of day. */
  widest?: string;
}) {
  const textClassName = small ? 'text-sm text-gray-300' : 'text-base text-gray-400';

  return (
    <View className="items-end">
      <RelistenText
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className={textClassName}
        style={{ height: 0, opacity: 0 }}
      >
        {widest}
      </RelistenText>
      <RelistenText className={textClassName}>{duration}</RelistenText>
    </View>
  );
}
