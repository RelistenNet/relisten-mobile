import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { NativeMenuView, type MenuAction } from '@/relisten/components/menus/native_menu_view';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { useGroupSegment } from '@/relisten/util/routes';
import { router, useNavigation } from 'expo-router';
import { type ReactNode, useCallback, useMemo } from 'react';
import { useGoToSong } from './go_to_song';

const ACTION_IDS = {
  artist: 'artist',
  show: 'show',
} as const;

/** Artist, show, or one of the track's songs (`go-to-song:<id>`). */
export type CurrentTrackNavigationActionId = string;

/**
 * Go-to actions for the playing track: its artist, show, and songs. Every one
 * leaves through `onBeforeNavigate` (closing the player first), not through a
 * `TrackNavigationProvider`, so callers inside the player must pass it.
 */
export function useCurrentTrackNavigation(onBeforeNavigate?: (navigate: () => void) => void) {
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();
  const groupSegment = useGroupSegment();
  const { pushShow } = usePushShowRespectingUserSettings();

  const artist = currentPlayerTrack?.sourceTrack.artist;
  const show = currentPlayerTrack?.sourceTrack.show;
  const source = currentPlayerTrack?.sourceTrack.source;
  const goToSong = useGoToSong(currentPlayerTrack?.sourceTrack, onBeforeNavigate);

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
            ...goToSong.actions,
          ]
        : [],
    [artist, goToSong.actions, show]
  );

  const handleAction = useCallback(
    (actionId: CurrentTrackNavigationActionId) => {
      if (!artist || !show || goToSong.handleAction(actionId)) {
        return;
      }

      const navigate = () => {
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
      };
      if (onBeforeNavigate) onBeforeNavigate(navigate);
      else navigate();
    },
    [artist, goToSong.handleAction, groupSegment, onBeforeNavigate, pushShow, show, source]
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
      onPressAction={({ nativeEvent }) => handleAction(nativeEvent.event)}
    >
      {children}
    </NativeMenuView>
  );
}
