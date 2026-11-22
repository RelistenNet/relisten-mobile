import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { type MenuAction } from '@/relisten/components/menus/native_menu_view';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { useGroupSegment } from '@/relisten/util/routes';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
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
 * leave the screen through `useLeaveScreen`, so inside the player they close
 * it first.
 */
export function useCurrentTrackNavigation() {
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();
  const groupSegment = useGroupSegment();
  const { pushShow } = usePushShowRespectingUserSettings();

  const artist = currentPlayerTrack?.sourceTrack.artist;
  const show = currentPlayerTrack?.sourceTrack.show;
  const source = currentPlayerTrack?.sourceTrack.source;
  const leaveScreen = useLeaveScreen();
  const { actions: songActions, handleAction: handleSongAction } = useGoToSong(
    currentPlayerTrack?.sourceTrack
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
