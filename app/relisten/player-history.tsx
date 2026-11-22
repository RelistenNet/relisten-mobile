import { TrackNavigationProvider } from '@/relisten/player/ui/track_navigation';
import { PlayerHistoryView } from '@/relisten/player/ui/player_history_view';
import { usePlayerPresentation } from '@/relisten/player/ui/player_presentation';
import { router } from 'expo-router';
import { useCallback } from 'react';

export default function Page() {
  const { closePlayer } = usePlayerPresentation();
  // This sheet sits over the player: close both before showing what was picked.
  const leaveToTabs = useCallback(
    (navigate: () => void) => {
      router.back();
      requestIdleCallback(() => closePlayer(navigate));
    },
    [closePlayer]
  );

  return (
    <TrackNavigationProvider beforeNavigate={leaveToTabs}>
      <PlayerHistoryView />
    </TrackNavigationProvider>
  );
}
