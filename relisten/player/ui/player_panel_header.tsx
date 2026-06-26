import { RelistenText } from '@/relisten/components/relisten_text';
import { PLAYER_PANEL_BACKGROUND } from '@/relisten/player/ui/player_panel_row';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import SegmentedControl from '@expo/ui/community/segmented-control';
import { useWindowDimensions, View } from 'react-native';

export type PlayerPanelMode = 'queue' | 'history';

const PANEL_MODES: PlayerPanelMode[] = ['queue', 'history'];
const PANEL_LABELS = ['Up Next', 'History'];

type PlayerPanelHeaderProps = {
  historyCount: number;
  mode: PlayerPanelMode;
  onModeChange: (mode: PlayerPanelMode) => void;
  queueCount: number;
};

export function PlayerPanelHeader({
  historyCount,
  mode,
  onModeChange,
  queueCount,
}: PlayerPanelHeaderProps) {
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);
  const selectedIndex = PANEL_MODES.indexOf(mode);

  return (
    <View
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
        paddingBottom: 8 * controlScale,
        paddingHorizontal: 12,
        paddingTop: 16,
        zIndex: 2,
      }}
    >
      <SegmentedControl
        appearance="dark"
        onChange={({ nativeEvent }) => {
          const nextMode = PANEL_MODES[nativeEvent.selectedSegmentIndex];

          if (nextMode) {
            onModeChange(nextMode);
          }
        }}
        selectedIndex={selectedIndex}
        style={{ minHeight: 32 * controlScale }}
        values={PANEL_LABELS}
      />
      <View
        className="flex-row items-center justify-between px-1 pt-3"
        style={{ minHeight: 20 * controlScale }}
      >
        <RelistenText
          className="text-base text-gray-300"
          maxFontSizeMultiplier={1.6}
          numberOfLines={1}
          selectable={false}
        >
          {mode === 'queue'
            ? `${queueCount} ${queueCount === 1 ? 'track' : 'tracks'}`
            : 'Recently played'}
        </RelistenText>
        {mode === 'history' && historyCount > 0 && (
          <RelistenText
            className="text-sm text-gray-400"
            maxFontSizeMultiplier={1.6}
            numberOfLines={1}
            selectable={false}
          >
            {historyCount} {historyCount === 1 ? 'play' : 'plays'}
          </RelistenText>
        )}
      </View>
    </View>
  );
}
