import { TrackNavigationProvider } from '@/relisten/player/ui/go_to_song';
import { PlayerHistoryView } from '@/relisten/player/ui/player_history_view';
import { usePlayerPresentation } from '@/relisten/player/ui/player_presentation';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { router } from 'expo-router';
import { useCallback } from 'react';

export default function Page() {
  const { pushShow } = usePushShowRespectingUserSettings();
  const { closePlayer } = usePlayerPresentation();
  // This sheet sits over the player: close both before showing what was picked.
  const leaveToTabs = useCallback(
    (navigate: () => void) => {
      router.back();
      requestIdleCallback(() => closePlayer(navigate));
    },
    [closePlayer]
  );
  const viewShow = useCallback(
    (entry: PlaybackHistoryEntry) => {
      leaveToTabs(() => {
        pushShow({
          artist: entry.artist,
          showUuid: entry.show.uuid,
          sourceUuid: entry.source.uuid,
        });
      });
    },
    [leaveToTabs, pushShow]
  );

  return (
    <TrackNavigationProvider beforeNavigate={leaveToTabs}>
      <PlayerHistoryView onViewShow={viewShow} />
    </TrackNavigationProvider>
  );
}
