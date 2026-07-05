import { RelistenText } from '@/relisten/components/relisten_text';
import {
  PLAYER_PANEL_ACCENT_COLOR,
  PLAYER_PANEL_BACKGROUND,
  PLAYER_PANEL_DIVIDER_COLOR,
  PLAYER_PANEL_HORIZONTAL_PADDING,
} from '@/relisten/player/ui/player_panel_theme';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import { MaterialIcons } from '@expo/vector-icons';
import { TouchableOpacity, useWindowDimensions, View } from 'react-native';

export function PlayerTimelineBoundary({
  accessibilityHint,
  icon,
  label,
  onPress,
}: {
  accessibilityHint?: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress?: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);
  const content = (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: 8,
        minHeight: 44 * controlScale,
        paddingHorizontal: PLAYER_PANEL_HORIZONTAL_PADDING,
        paddingVertical: 6 * controlScale,
      }}
    >
      <MaterialIcons color={PLAYER_PANEL_ACCENT_COLOR} name={icon} size={19 * controlScale} />
      <RelistenText
        adjustsFontSizeToFit
        className="text-sm font-semibold uppercase text-relisten-blue-200/80"
        minimumFontScale={0.82}
        numberOfLines={1}
        selectable={false}
        style={{ flexShrink: 1, letterSpacing: 1.1 }}
      >
        {label}
      </RelistenText>
      <View style={{ backgroundColor: PLAYER_PANEL_DIVIDER_COLOR, flex: 1, height: 1 }} />
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        accessibilityHint={accessibilityHint}
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={onPress}
        style={{ backgroundColor: PLAYER_PANEL_BACKGROUND }}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="header"
      style={{ backgroundColor: PLAYER_PANEL_BACKGROUND }}
    >
      {content}
    </View>
  );
}
