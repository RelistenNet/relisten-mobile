import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { NativeMenuView, type MenuAction } from '@/relisten/components/menus/native_menu_view';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { useGroupSegment } from '@/relisten/util/routes';
import { router, useNavigation } from 'expo-router';
import { type ReactNode, useCallback, useMemo } from 'react';

const ACTION_IDS = {
  artist: 'artist',
  show: 'show',
} as const;

export type CurrentTrackNavigationActionId = (typeof ACTION_IDS)[keyof typeof ACTION_IDS];
type CurrentTrackNavigationAction = MenuAction & { id: CurrentTrackNavigationActionId };

export function useCurrentTrackNavigation(onBeforeNavigate?: () => void) {
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

  return { actions, handleAction };
}

type CurrentTrackNavigationMenuProps = {
  children: ReactNode;
  dismissOnNavigate?: boolean;
  onBeforeNavigate?: () => void;
};

export function CurrentTrackNavigationMenu({
  children,
  dismissOnNavigate = true,
  onBeforeNavigate,
}: CurrentTrackNavigationMenuProps) {
  const navigation = useNavigation();
  const handleBeforeNavigate = useCallback(() => {
    if (onBeforeNavigate) {
      onBeforeNavigate();
      return;
    }

    if (dismissOnNavigate) {
      navigation.goBack();
    }
  }, [dismissOnNavigate, navigation, onBeforeNavigate]);
  const { actions, handleAction } = useCurrentTrackNavigation(handleBeforeNavigate);

  if (actions.length === 0) {
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
