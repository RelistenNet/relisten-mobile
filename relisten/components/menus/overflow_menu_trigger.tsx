import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import { Platform, useWindowDimensions, View } from 'react-native';
import colors from 'tailwindcss/colors';

const DEFAULT_ICON_SIZE = 20;
const MINIMUM_TOUCH_TARGET_SIZE = 44;
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
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);
  const color = ICON_COLORS[tone];
  const scaledIconSize = DEFAULT_ICON_SIZE * controlScale;
  const minimumTouchTargetSize = MINIMUM_TOUCH_TARGET_SIZE * controlScale;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={{
        alignItems: iconAlignment === 'trailing' ? 'flex-end' : 'center',
        justifyContent: 'center',
        minHeight: minimumTouchTargetSize,
        minWidth: minimumTouchTargetSize,
        paddingRight: iconAlignment === 'trailing' ? 4 * controlScale : 0,
      }}
    >
      {Platform.OS === 'ios' ? (
        <Ionicons color={color} name="ellipsis-horizontal-circle-outline" size={scaledIconSize} />
      ) : (
        <MaterialIcons color={color} name="more-vert" size={scaledIconSize} />
      )}
    </View>
  );
}
