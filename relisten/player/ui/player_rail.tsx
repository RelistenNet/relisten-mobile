import { RelistenNavigationProvider } from '@/relisten/util/routes';
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
export function PlayerRail() {
  const hideRail = useCallback(() => setPlayerRailOpen(false), []);

  return (
    <View className="border-l border-white/10" style={{ width: PLAYER_RAIL_WIDTH }}>
      {/* Menus in the player navigate into the Artists tab, as the full-screen player does. */}
      <RelistenNavigationProvider groupSegment="(artists)">
        <PlayerScreen onClose={hideRail} variant="embedded" />
      </RelistenNavigationProvider>
    </View>
  );
}
