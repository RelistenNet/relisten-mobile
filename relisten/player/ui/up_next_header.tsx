import { RelistenText } from '@/relisten/components/relisten_text';
import { PLAYER_PANEL_BACKGROUND } from '@/relisten/player/ui/player_panel_row';
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
        backgroundColor: PLAYER_PANEL_BACKGROUND,
        borderColor: 'rgba(60, 219, 255, 0.34)',
        borderCurve: 'continuous',
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderTopWidth: 1,
        boxShadow: '0 -10px 24px rgba(0, 0, 0, 0.38)',
        minHeight: 62 * controlScale,
        paddingBottom: 8 * controlScale,
        paddingHorizontal: 16,
        paddingTop: 12 * controlScale,
        zIndex: 2,
      }}
    >
      <RelistenText className="text-lg font-semibold" selectable={false}>
        Up Next
      </RelistenText>
      <RelistenText className="text-sm text-gray-300" selectable={false}>
        {count} {count === 1 ? 'track' : 'tracks'}
      </RelistenText>
    </View>
  );
}
