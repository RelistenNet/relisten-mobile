import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { audioAdjustmentNative } from '@/relisten/player/audio_adjustments/audio_adjustment_native';
import {
  type CurrentTrackNavigationActionId,
  useCurrentTrackNavigation,
} from '@/relisten/player/ui/current_track_navigation_menu';
import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { router, Stack } from 'expo-router';
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
              title: 'Audio Adjustments',
            } as const,
          ]
        : []),
    ],
    [navigationActions]
  );

  const handleAction = useCallback(
    (actionId: PlayerActionId) => {
      if (actionId === AUDIO_ADJUSTMENTS_ACTION_ID) {
        onBeforeNavigate?.();
        router.push('/relisten/audio-adjustments');
        return;
      }

      handleNavigationAction(actionId);
    },
    [handleNavigationAction, onBeforeNavigate]
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
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => handleAction(nativeEvent.event as PlayerActionId)}
    >
      {children}
    </MenuView>
  );
}

export function PlayerHeaderToolbar({ onClose }: { onClose: () => void }) {
  const { actions, handleAction } = usePlayerActions(onClose);

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel="Close player"
          icon={nativeMenuIcons.collapse}
          onPress={onClose}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu
          accessibilityLabel="Player actions"
          hidden={actions.length === 0}
          icon={nativeMenuIcons.toolbarMore}
        >
          {actions.map((action) => (
            <Stack.Toolbar.MenuAction
              icon={action.image}
              key={action.id}
              onPress={() => handleAction(action.id)}
            >
              {action.title}
            </Stack.Toolbar.MenuAction>
          ))}
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
    </>
  );
}
