import { RelistenText } from '@/relisten/components/relisten_text';
import { View } from 'react-native';

/** A circle with the username's first letter. Relisten has no profile photos. */
export function AccountAvatar({ username, size }: { username?: string; size: number }) {
  const initial = username?.[0]?.toUpperCase();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center rounded-full bg-relisten-blue-600"
      style={{ width: size, height: size }}
    >
      {initial ? (
        <RelistenText className="font-bold" style={{ fontSize: size * 0.45 }} selectable={false}>
          {initial}
        </RelistenText>
      ) : null}
    </View>
  );
}
