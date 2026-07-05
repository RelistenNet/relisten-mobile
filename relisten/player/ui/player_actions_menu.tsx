import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { NativeMenuView, type MenuAction } from '@/relisten/components/menus/native_menu_view';
import { audioAdjustmentNative } from '@/relisten/player/audio_adjustments/audio_adjustment_native';
import {
  type CurrentTrackNavigationActionId,
  useCurrentTrackNavigation,
} from '@/relisten/player/ui/current_track_navigation_menu';
import { router } from 'expo-router';
import { useCallback, useMemo, type ReactNode } from 'react';

const AUDIO_ADJUSTMENTS_ACTION_ID = 'audio-adjustments';
const SUPPORTS_AUDIO_ADJUSTMENTS = audioAdjustmentNative.capabilities().supported;

type PlayerActionId = CurrentTrackNavigationActionId | typeof AUDIO_ADJUSTMENTS_ACTION_ID;
type PlayerAction = MenuAction & { id: PlayerActionId };

function usePlayerActions(onBeforeNavigate?: () => void) {
  const { actions: navigationActions, handleAction: handleNavigationAction } =
    useCurrentTrackNavigation(onBeforeNavigate);
  const actions = useMemo<PlayerAction[]>(
    () => [
      ...navigationActions,
      ...(SUPPORTS_AUDIO_ADJUSTMENTS
        ? [
            {
              id: AUDIO_ADJUSTMENTS_ACTION_ID,
              image: nativeMenuIcons.audioAdjustments,
              title: 'Audio Equalizer',
            } as const,
          ]
        : []),
    ],
    [navigationActions]
  );

  const handleAction = useCallback(
    (actionId: PlayerActionId) => {
      if (actionId === AUDIO_ADJUSTMENTS_ACTION_ID) {
        router.push('/relisten/audio-adjustments');
        return;
      }

      handleNavigationAction(actionId);
    },
    [handleNavigationAction]
  );

  return { actions, handleAction };
}

type PlayerActionsMenuProps = {
  children: ReactNode;
  onBeforeNavigate?: () => void;
};

export function PlayerActionsMenu({ children, onBeforeNavigate }: PlayerActionsMenuProps) {
  const { actions, handleAction } = usePlayerActions(onBeforeNavigate);

  if (actions.length === 0) {
    return children;
  }

  return (
    <NativeMenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => handleAction(nativeEvent.event as PlayerActionId)}
    >
      {children}
    </NativeMenuView>
  );
}
