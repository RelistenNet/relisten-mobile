import type { MenuAction } from '@/relisten/components/menus/native_menu_view';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
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
 * How a menu leaves its screen: through `beforeNavigate` when the menu knows
 * (the full player's own menus), else through the screen's
 * `TrackNavigationProvider`, else in place.
 */
export function useLeaveScreen(beforeNavigate?: BeforeNavigate): BeforeNavigate {
  const providedBeforeNavigate = useContext(TrackNavigationContext);
  const leave = beforeNavigate ?? providedBeforeNavigate;

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
export function useGoToSong(sourceTrack: SourceTrack | undefined, beforeNavigate?: BeforeNavigate) {
  const leaveScreen = useLeaveScreen(beforeNavigate);
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
