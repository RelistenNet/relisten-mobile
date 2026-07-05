import { RelistenText } from '@/relisten/components/relisten_text';
import {
  PLAYER_PANEL_BACKGROUND,
  PLAYER_PANEL_BORDER_COLOR,
  PLAYER_PANEL_HORIZONTAL_PADDING,
} from '@/relisten/player/ui/player_panel_theme';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import { useWindowDimensions, View } from 'react-native';

export function UpNextHeader({ count }: { count: number }) {
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);

  return (
    <View
      accessibilityLabel={`Up Next, ${count} ${count === 1 ? 'track' : 'tracks'}`}
      accessibilityRole="header"
      style={{
        alignItems: 'center',
        backgroundColor: PLAYER_PANEL_BACKGROUND,
        borderColor: PLAYER_PANEL_BORDER_COLOR,
        borderCurve: 'continuous',
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        borderTopWidth: 1,
        boxShadow: '0 -8px 22px rgba(0, 0, 0, 0.32)',
        flexDirection: 'row',
        justifyContent: 'space-between',
        minHeight: 56 * controlScale,
        paddingHorizontal: PLAYER_PANEL_HORIZONTAL_PADDING,
        paddingVertical: 9 * controlScale,
        zIndex: 2,
      }}
    >
      <RelistenText className="text-lg font-semibold" selectable={false}>
        Up Next
      </RelistenText>
      <RelistenText className="text-sm text-gray-300/80" selectable={false}>
        {count} {count === 1 ? 'track' : 'tracks'}
      </RelistenText>
    </View>
  );
}
