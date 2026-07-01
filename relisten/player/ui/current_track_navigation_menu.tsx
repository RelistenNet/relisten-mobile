import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { NativeMenuView, type MenuAction } from '@/relisten/components/menus/native_menu_view';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { useGroupSegment } from '@/relisten/util/routes';
import { Stack, router, useNavigation } from 'expo-router';
import { type ReactNode, useCallback, useMemo } from 'react';

const ACTION_IDS = {
  artist: 'artist',
  show: 'show',
} as const;

type CurrentTrackNavigationActionId = (typeof ACTION_IDS)[keyof typeof ACTION_IDS];
type CurrentTrackNavigationAction = MenuAction & { id: CurrentTrackNavigationActionId };

function useCurrentTrackNavigation(dismissOnNavigate: boolean) {
  const navigation = useNavigation();
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

      if (dismissOnNavigate) {
        navigation.goBack();
      }

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
    [artist, dismissOnNavigate, groupSegment, navigation, pushShow, show, source]
  );

  return { actions, handleAction, hasActions: actions.length > 0 };
}

type CurrentTrackNavigationMenuProps = {
  children: ReactNode;
  dismissOnNavigate?: boolean;
};

export function CurrentTrackNavigationMenu({
  children,
  dismissOnNavigate = true,
}: CurrentTrackNavigationMenuProps) {
  const { actions, handleAction, hasActions } = useCurrentTrackNavigation(dismissOnNavigate);

  if (!hasActions) {
    return children;
  }

  return (
    <NativeMenuView
      actions={actions}
      onPressAction={({ nativeEvent }) =>
        handleAction(nativeEvent.event as CurrentTrackNavigationActionId)
      }
    >
      {children}
    </NativeMenuView>
  );
}

type PlayerHeaderToolbarProps = {
  onClose: () => void;
};

export function PlayerHeaderToolbar({ onClose }: PlayerHeaderToolbarProps) {
  const { actions, handleAction, hasActions } = useCurrentTrackNavigation(true);

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel="Close player"
          icon={nativeMenuIcons.close}
          onPress={onClose}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu
          accessibilityLabel="Current track navigation"
          hidden={!hasActions}
          icon={nativeMenuIcons.more}
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
