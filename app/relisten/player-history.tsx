import { PlayerHistoryView } from '@/relisten/player/ui/player_history_view';
import { usePlayerPresentation } from '@/relisten/player/ui/player_presentation';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { InteractionManager } from 'react-native';

export default function Page() {
  const { pushShow } = usePushShowRespectingUserSettings();
  const { closePlayer } = usePlayerPresentation();
  const viewShow = useCallback(
    (entry: PlaybackHistoryEntry) => {
      router.back();
      void InteractionManager.runAfterInteractions(() => {
        closePlayer(() => {
          pushShow({
            artist: entry.artist,
            showUuid: entry.show.uuid,
            sourceUuid: entry.source.uuid,
          });
        });
      });
    },
    [closePlayer, pushShow]
  );

  return <PlayerHistoryView onViewShow={viewShow} />;
}
