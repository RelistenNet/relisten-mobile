import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';
import colors from 'tailwindcss/colors';

type OverflowMenuTriggerProps = {
  accessibilityLabel: string;
  iconAlignment?: 'center' | 'trailing';
};

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
        <Ionicons color={colors.white} name="ellipsis-horizontal-circle-outline" size={20} />
      ) : (
        <MaterialIcons color={colors.white} name="more-vert" size={20} />
      )}
    </View>
  );
}
