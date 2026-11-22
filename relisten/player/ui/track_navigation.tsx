import type { MenuAction } from '@/relisten/components/menus/native_menu_view';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { useGroupSegment } from '@/relisten/util/routes';
import { router } from 'expo-router';
import { createContext, type PropsWithChildren, useCallback, useContext, useMemo } from 'react';
import { GO_TO_SONG_PREFIX, goToSongActions, songsOf } from './track_songs';

type BeforeNavigate = (navigate: () => void) => void;

/**
 * How a track menu leaves its screen. Inside the full player or a sheet over
 * it, the player has to close first; elsewhere a menu navigates in place.
 */
const TrackNavigationContext = createContext<BeforeNavigate | undefined>(undefined);
TrackNavigationContext.displayName = 'TrackNavigation';

export function TrackNavigationProvider({
  beforeNavigate,
  children,
}: PropsWithChildren<{ beforeNavigate: BeforeNavigate }>) {
  return (
    <TrackNavigationContext.Provider value={beforeNavigate}>
      {children}
    </TrackNavigationContext.Provider>
  );
}

/**
 * How a menu leaves its screen: through the screen's `TrackNavigationProvider`,
 * else in place.
 */
export function useLeaveScreen(): BeforeNavigate {
  const leave = useContext(TrackNavigationContext);

  return useCallback(
    (navigate: () => void) => {
      if (leave) {
        leave(navigate);
      } else {
        navigate();
      }
    },
    [leave]
  );
}

/**
 * "Go to Song" menu actions for a track, and the handler that follows one.
 * `handleAction` returns false for any other action, so a menu can try it
 * before its own switch.
 */
export function useGoToSong(sourceTrack: SourceTrack | undefined) {
  const leaveScreen = useLeaveScreen();
  const groupSegment = useGroupSegment();
  const songs = useMemo(() => (sourceTrack ? songsOf(sourceTrack) : []), [sourceTrack]);
  const actions = useMemo<MenuAction[]>(() => goToSongActions(songs), [songs]);

  const handleAction = useCallback(
    (actionId: string) => {
      if (!sourceTrack || !actionId.startsWith(GO_TO_SONG_PREFIX)) {
        return false;
      }

      const songUuid = actionId.slice(GO_TO_SONG_PREFIX.length);
      leaveScreen(() =>
        router.push({
          pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/song/[songUuid]/` as const,
          params: { artistUuid: sourceTrack.artistUuid, songUuid },
        })
      );
      return true;
    },
    [groupSegment, leaveScreen, sourceTrack]
  );

  return { actions, handleAction };
}

/** The label for going to a track's show: its date, as the player shows it. */
export function goToShowTitle(sourceTrack: SourceTrack) {
  return `Go to ${sourceTrack.show.displayDate}`;
}

/**
 * Opens a track's show, at the track's source, in the Artists tab. Wherever
 * the menu was (a playlist in My Library, history), switching tabs then goes
 * back to it.
 */
export function useGoToShow() {
  const leaveScreen = useLeaveScreen();
  const { pushShow } = usePushShowRespectingUserSettings();

  return useCallback(
    (sourceTrack: SourceTrack) =>
      leaveScreen(() =>
        pushShow({
          artist: sourceTrack.artist,
          showUuid: sourceTrack.showUuid,
          sourceUuid: sourceTrack.sourceUuid,
          overrideGroupSegment: '(artists)',
        })
      ),
    [leaveScreen, pushShow]
  );
}
