import type { MenuAction } from '@/relisten/components/menus/native_menu_view';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { useGroupSegment } from '@/relisten/util/routes';
import { router } from 'expo-router';
import { createContext, type ReactNode, useCallback, useContext, useMemo } from 'react';
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
}: {
  beforeNavigate: BeforeNavigate;
  children: ReactNode;
}) {
  return (
    <TrackNavigationContext.Provider value={beforeNavigate}>
      {children}
    </TrackNavigationContext.Provider>
  );
}

/**
 * "Go to Song" menu actions for a track, and the handler that follows one.
 * `handleAction` returns false for any other action, so a menu can try it
 * before its own switch. `beforeNavigate` overrides the provided one, for a
 * menu that already knows how it leaves.
 */
export function useGoToSong(sourceTrack: SourceTrack | undefined, beforeNavigate?: BeforeNavigate) {
  const providedBeforeNavigate = useContext(TrackNavigationContext);
  const leave = beforeNavigate ?? providedBeforeNavigate;
  const groupSegment = useGroupSegment();
  const songs = useMemo(() => (sourceTrack ? songsOf(sourceTrack) : []), [sourceTrack]);
  const actions = useMemo<MenuAction[]>(() => goToSongActions(songs), [songs]);

  const handleAction = useCallback(
    (actionId: string) => {
      if (!sourceTrack || !actionId.startsWith(GO_TO_SONG_PREFIX)) {
        return false;
      }

      const songUuid = actionId.slice(GO_TO_SONG_PREFIX.length);
      const navigate = () =>
        router.push({
          pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/song/[songUuid]/` as const,
          params: { artistUuid: sourceTrack.artistUuid, songUuid },
        });
      if (leave) {
        leave(navigate);
      } else {
        navigate();
      }
      return true;
    },
    [groupSegment, leave, sourceTrack]
  );

  return { actions, handleAction };
}
