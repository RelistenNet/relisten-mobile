import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';
import colors from 'tailwindcss/colors';

type OverflowMenuTriggerProps = {
  accessibilityLabel: string;
  iconAlignment?: 'center' | 'trailing';
};

/**
 * Quieter than a row's title, but a step brighter than its duration
 * (gray-400), so the menu stays easy to find without competing with the text.
 * Other trailing row controls, such as Add Tracks' **+**, use it too.
 */
export const ROW_ACCESSORY_ICON_COLOR = colors.gray[200];
export const ROW_ACCESSORY_ICON_SIZE = 20;
const ICON_COLOR = ROW_ACCESSORY_ICON_COLOR;

export function OverflowMenuTrigger({
  accessibilityLabel,
  iconAlignment = 'center',
}: OverflowMenuTriggerProps) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className={
        iconAlignment === 'trailing'
          ? 'h-11 w-11 items-end justify-center pr-0.5'
          : 'h-11 w-11 items-center justify-center'
      }
    >
      {Platform.OS === 'ios' ? (
        <Ionicons
          color={ICON_COLOR}
          name="ellipsis-horizontal-circle-outline"
          size={ROW_ACCESSORY_ICON_SIZE}
        />
      ) : (
        <MaterialIcons color={ICON_COLOR} name="more-vert" size={ROW_ACCESSORY_ICON_SIZE} />
      )}
    </View>
  );
}
