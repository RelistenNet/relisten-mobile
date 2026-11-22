import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { type MenuAction } from '@/relisten/components/menus/native_menu_view';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import { useGroupSegment } from '@/relisten/util/routes';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import type { GoToSongActionId } from './track_songs';
import { goToShowTitle, useGoToShow, useGoToSong, useLeaveScreen } from './track_navigation';

const ACTION_IDS = {
  artist: 'artist',
  show: 'show',
} as const;

export type CurrentTrackNavigationActionId =
  | (typeof ACTION_IDS)[keyof typeof ACTION_IDS]
  | GoToSongActionId;

/**
 * Go-to actions for the playing track: its artist, show, and songs. They all
 * leave the screen through `useLeaveScreen`, so inside the player they close
 * it first.
 */
export function useCurrentTrackNavigation() {
  const sourceTrack = useRelistenPlayerCurrentTrack()?.sourceTrack;
  const groupSegment = useGroupSegment();
  const leaveScreen = useLeaveScreen();
  const goToShow = useGoToShow();
  const { actions: songActions, handleAction: handleSongAction } = useGoToSong(sourceTrack);

  const artist = sourceTrack?.artist;
  const show = sourceTrack?.show;

  const actions = useMemo<MenuAction[]>(
    () =>
      sourceTrack && artist && show
        ? [
            {
              id: ACTION_IDS.artist,
              image: nativeMenuIcons.artist,
              title: `Go to ${artist.name}`,
            },
            { id: ACTION_IDS.show, image: nativeMenuIcons.show, title: goToShowTitle(sourceTrack) },
            ...songActions,
          ]
        : [],
    [artist, show, songActions, sourceTrack]
  );

  const handleAction = useCallback(
    (actionId: CurrentTrackNavigationActionId) => {
      if (!sourceTrack || !artist || handleSongAction(actionId)) {
        return;
      }

      if (actionId === ACTION_IDS.show) {
        goToShow(sourceTrack);
      } else if (actionId === ACTION_IDS.artist) {
        leaveScreen(() =>
          router.push({
            pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/`,
            params: { artistUuid: artist.uuid },
          })
        );
      }
    },
    [artist, goToShow, groupSegment, handleSongAction, leaveScreen, sourceTrack]
  );

  return { actions, handleAction };
}
