import { RelistenNavigationProvider } from '@/relisten/util/routes';
import { SidePane } from '@/relisten/util/side_pane';
import { useCallback } from 'react';
import { View } from 'react-native';
import { PlayerScreen } from './player_screen';
import { setPlayerRailOpen } from './player_rail_state';

export const PLAYER_RAIL_WIDTH = 360;

/**
 * The player beside the content in a wide window: the same screen as the
 * full-screen player, including its draggable queue sheet, with a button that
 * hides it. The mini player brings it back.
 */
export function PlayerRail({ visible }: { visible: boolean }) {
  const hideRail = useCallback(() => setPlayerRailOpen(false), []);

  return (
    <SidePane edge="trailing" open={visible} openWidth={PLAYER_RAIL_WIDTH}>
      <View className="flex-1 border-l border-white/10">
        {/* Menus in the player navigate into the Artists tab, as the full-screen player does. */}
        <RelistenNavigationProvider groupSegment="(artists)">
          <PlayerScreen onClose={hideRail} variant="embedded" visible={visible} />
        </RelistenNavigationProvider>
      </View>
    </SidePane>
  );
}
