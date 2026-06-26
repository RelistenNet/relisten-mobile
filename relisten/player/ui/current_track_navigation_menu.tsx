import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { useGroupSegment } from '@/relisten/util/routes';
import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { Stack, router } from 'expo-router';
import { useCallback, useMemo, type ReactNode } from 'react';

const ACTION_IDS = {
  artist: 'artist',
  show: 'show',
} as const;

type CurrentTrackNavigationActionId = (typeof ACTION_IDS)[keyof typeof ACTION_IDS];
type CurrentTrackNavigationAction = MenuAction & { id: CurrentTrackNavigationActionId };

function useCurrentTrackNavigation(onBeforeNavigate?: () => void) {
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();
  const groupSegment = useGroupSegment();
  const { pushShow } = usePushShowRespectingUserSettings();

  const artist = currentPlayerTrack?.sourceTrack.artist;
  const show = currentPlayerTrack?.sourceTrack.show;
  const source = currentPlayerTrack?.sourceTrack.source;

  const actions = useMemo<CurrentTrackNavigationAction[]>(
    () =>
      artist && show
        ? [
            {
              id: ACTION_IDS.artist,
              image: nativeMenuIcons.artist,
              title: `Go to ${artist.name}`,
            },
            {
              id: ACTION_IDS.show,
              image: nativeMenuIcons.show,
              title: `Go to ${show.displayDate}`,
            },
          ]
        : [],
    [artist, show]
  );

  const handleAction = useCallback(
    (actionId: CurrentTrackNavigationActionId) => {
      if (!artist || !show) {
        return;
      }

      onBeforeNavigate?.();

      if (actionId === ACTION_IDS.artist) {
        router.push({
          pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/`,
          params: { artistUuid: artist.uuid },
        });
      } else if (actionId === ACTION_IDS.show) {
        pushShow({
          artist,
          showUuid: show.uuid,
          sourceUuid: source?.uuid,
          overrideGroupSegment: '(artists)',
        });
      }
    },
    [artist, groupSegment, onBeforeNavigate, pushShow, show, source]
  );

  return { actions, handleAction, hasActions: actions.length > 0 };
}

type CurrentTrackNavigationMenuProps = {
  children: ReactNode;
  onBeforeNavigate?: () => void;
};

export function CurrentTrackNavigationMenu({
  children,
  onBeforeNavigate,
}: CurrentTrackNavigationMenuProps) {
  const { actions, handleAction, hasActions } = useCurrentTrackNavigation(onBeforeNavigate);

  if (!hasActions) {
    return children;
  }

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) =>
        handleAction(nativeEvent.event as CurrentTrackNavigationActionId)
      }
    >
      {children}
    </MenuView>
  );
}

type PlayerHeaderToolbarProps = {
  onClose: () => void;
};

export function PlayerHeaderToolbar({ onClose }: PlayerHeaderToolbarProps) {
  const { actions, handleAction, hasActions } = useCurrentTrackNavigation(onClose);

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
          accessibilityLabel="Current track navigation"
          hidden={!hasActions}
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
