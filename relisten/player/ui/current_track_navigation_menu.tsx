import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { NativeMenuView, type MenuAction } from '@/relisten/components/menus/native_menu_view';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import { useGroupSegment } from '@/relisten/util/routes';
import { showVenueName, showVenueRoute } from '@/relisten/util/venue_route';
import { router } from 'expo-router';
import { type ReactNode, useCallback, useMemo } from 'react';
import type { GoToSongActionId } from './track_songs';
import { goToShowTitle, useGoToShow, useGoToSong, useLeaveScreen } from './track_navigation';

const ACTION_IDS = {
  artist: 'artist',
  show: 'show',
  venue: 'venue',
} as const;

export type CurrentTrackNavigationActionId =
  | (typeof ACTION_IDS)[keyof typeof ACTION_IDS]
  | GoToSongActionId;

/**
 * Go-to actions for the playing track: its artist, show, venue, and songs. They all
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
  const venueName = show && showVenueName(show);
  const venueRoute = useMemo(
    () => (show ? showVenueRoute(show, groupSegment) : undefined),
    [groupSegment, show]
  );

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
            ...(venueName && venueRoute
              ? [
                  {
                    id: ACTION_IDS.venue,
                    image: nativeMenuIcons.venue,
                    title: `Go to ${venueName}`,
                  },
                ]
              : []),
            ...songActions,
          ]
        : [],
    [artist, show, songActions, sourceTrack, venueName, venueRoute]
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
      } else if (actionId === ACTION_IDS.venue && venueRoute) {
        leaveScreen(() => router.push(venueRoute));
      }
    },
    [artist, goToShow, groupSegment, handleSongAction, leaveScreen, sourceTrack, venueRoute]
  );

  return { actions, handleAction };
}

/**
 * Opens the playing track's Go To actions on a tap, so the title, artist and
 * venue lead where the More menu's Go To section does.
 */
export function CurrentTrackNavigationMenu({ children }: { children: ReactNode }) {
  const { actions, handleAction } = useCurrentTrackNavigation();

  if (actions.length === 0) {
    return children;
  }

  return (
    <NativeMenuView
      actions={actions}
      // The native menu reports back the ids of `actions`.
      onPressAction={({ nativeEvent }) =>
        handleAction(nativeEvent.event as CurrentTrackNavigationActionId)
      }
      shouldOpenOnLongPress={false}
    >
      {children}
    </NativeMenuView>
  );
}
