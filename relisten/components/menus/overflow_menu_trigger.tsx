import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';
import colors from 'tailwindcss/colors';

const ICON_COLORS = {
  default: colors.white,
  muted: colors.gray['400'],
} as const;

type OverflowMenuTriggerTone = keyof typeof ICON_COLORS;

type OverflowMenuTriggerProps = {
  accessibilityLabel: string;
  iconAlignment?: 'center' | 'trailing';
  tone?: OverflowMenuTriggerTone;
};

export function OverflowMenuTrigger({
  accessibilityLabel,
  iconAlignment = 'center',
  tone = 'default',
}: OverflowMenuTriggerProps) {
  const color = ICON_COLORS[tone];

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className={
        iconAlignment === 'trailing'
          ? 'min-h-11 min-w-11 items-end justify-center pr-0.5'
          : 'min-h-11 min-w-11 items-center justify-center'
      }
    >
      {Platform.OS === 'ios' ? (
        <Ionicons color={color} name="ellipsis-horizontal-circle-outline" size={20} />
      ) : (
        <MaterialIcons color={color} name="more-vert" size={20} />
      )}
    </View>
  );
}
