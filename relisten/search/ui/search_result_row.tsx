import type { ReactNode } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import type { SearchRowText } from '../search_rows';

/**
 * A search result: title, the facts that tell it apart, and an optional
 * accessory at the end (Add Tracks' **+**). The accessory sits outside the
 * row's own button, so tapping it never opens the row.
 */
export function SearchResultRow({
  text,
  onPress,
  onLongPress,
  trailing,
}: {
  text: SearchRowText;
  onPress?: () => void;
  onLongPress?: () => void;
  trailing?: ReactNode;
}) {
  const label = [text.title, text.subtitle, text.detail, ...text.badges].filter(Boolean).join(', ');

  return (
    <View className="min-h-[56px] flex-row items-center pr-2">
      <TouchableOpacity
        accessibilityLabel={label}
        accessibilityRole="button"
        className="min-w-0 flex-1 py-3 pl-4 pr-2"
        disabled={!onPress}
        onLongPress={onLongPress}
        onPress={onPress}
      >
        <RelistenText className="text-lg font-semibold" numberOfLines={2}>
          {text.title}
        </RelistenText>
        {text.subtitle ? (
          <RelistenText className="text-sm text-gray-400" numberOfLines={2}>
            {text.subtitle}
          </RelistenText>
        ) : null}
        {text.detail || text.badges.length > 0 ? (
          <View className="mt-0.5 flex-row flex-wrap items-center" style={{ gap: 6 }}>
            {text.detail ? (
              <RelistenText className="text-sm text-gray-300">{text.detail}</RelistenText>
            ) : null}
            {text.badges.map((badge) => (
              <View key={badge} className="rounded bg-relisten-blue-700 px-1.5">
                <RelistenText className="text-xs font-semibold">{badge}</RelistenText>
              </View>
            ))}
          </View>
        ) : null}
      </TouchableOpacity>
      {trailing}
    </View>
  );
}
