import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { NativeMenuView, type MenuAction } from '@/relisten/components/menus/native_menu_view';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { useGroupSegment } from '@/relisten/util/routes';
import { router, useNavigation } from 'expo-router';
import { type ReactNode, useCallback, useMemo } from 'react';
import type { GoToSongActionId } from './track_songs';
import { useGoToSong, useLeaveScreen } from './track_navigation';

const ACTION_IDS = {
  artist: 'artist',
  show: 'show',
} as const;

export type CurrentTrackNavigationActionId =
  | (typeof ACTION_IDS)[keyof typeof ACTION_IDS]
  | GoToSongActionId;

/**
 * Go-to actions for the playing track: its artist, show, and songs. They all
 * leave the screen through `useLeaveScreen`: `onBeforeNavigate` (closing the
 * player) when given, else the screen's `TrackNavigationProvider`.
 */
export function useCurrentTrackNavigation(onBeforeNavigate?: (navigate: () => void) => void) {
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();
  const groupSegment = useGroupSegment();
  const { pushShow } = usePushShowRespectingUserSettings();

  const artist = currentPlayerTrack?.sourceTrack.artist;
  const show = currentPlayerTrack?.sourceTrack.show;
  const source = currentPlayerTrack?.sourceTrack.source;
  const leaveScreen = useLeaveScreen(onBeforeNavigate);
  const { actions: songActions, handleAction: handleSongAction } = useGoToSong(
    currentPlayerTrack?.sourceTrack,
    onBeforeNavigate
  );

  const actions = useMemo<MenuAction[]>(
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
            ...songActions,
          ]
        : [],
    [artist, songActions, show]
  );

  const handleAction = useCallback(
    (actionId: CurrentTrackNavigationActionId) => {
      if (!artist || !show || handleSongAction(actionId)) {
        return;
      }

      leaveScreen(() => {
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
      });
    },
    [artist, groupSegment, handleSongAction, leaveScreen, pushShow, show, source]
  );

  return { actions, handleAction };
}

type CurrentTrackNavigationMenuProps = {
  children: ReactNode;
  dismissOnNavigate?: boolean;
  onBeforeNavigate?: (navigate: () => void) => void;
};

export function CurrentTrackNavigationMenu({
  children,
  dismissOnNavigate = true,
  onBeforeNavigate,
}: CurrentTrackNavigationMenuProps) {
  const navigation = useNavigation();
  const handleBeforeNavigate = useCallback(
    (navigate: () => void) => {
      if (onBeforeNavigate) {
        onBeforeNavigate(navigate);
      } else if (dismissOnNavigate) {
        navigation.goBack();
        requestIdleCallback(navigate);
      } else {
        navigate();
      }
    },
    [dismissOnNavigate, navigation, onBeforeNavigate]
  );
  const { actions, handleAction } = useCurrentTrackNavigation(handleBeforeNavigate);

  if (actions.length === 0) {
    return children;
  }

  return (
    <NativeMenuView
      actions={actions}
      // The native menu reports back the ids of `actions`, built above.
      onPressAction={({ nativeEvent }) =>
        handleAction(nativeEvent.event as CurrentTrackNavigationActionId)
      }
    >
      {children}
    </NativeMenuView>
  );
}
