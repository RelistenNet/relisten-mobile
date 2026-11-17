import { useEffect } from 'react';
import type { RelistenErrorEvent } from '@/modules/relisten-audio-player';
import { useRelistenApi } from '@/relisten/api/context';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { latestError } from '@/relisten/player/shared_state';
import { useRealm } from '@/relisten/realm/schema';
import { trackIdForSourceTrack } from '@/relisten/playlists/playlist_hooks';
import { resolvePlaylistTracks } from '@/relisten/playlists/playlist_hydration';

/** Stops an offline device from racing through the queue skipping every track. */
const MAX_SKIPS_IN_A_ROW = 3;
const SKIP_STREAK_RESET_MS = 60_000;

/**
 * A failed playlist track is the only time a cached track is re-checked. If the
 * catalog says the recording is gone, it is marked unavailable and, if it is
 * still the one playing, the player moves on. The player's own error toast and
 * logging are unchanged.
 */
export function PlaylistPlaybackRecovery() {
  const realm = useRealm();
  const player = useRelistenPlayer();
  const { apiClient } = useRelistenApi();

  useEffect(() => {
    let skipsInARow = 0;
    let lastSkipAt = 0;

    const onError = async (event: RelistenErrorEvent) => {
      const failed = player.queue.orderedTracks.find((t) => t.identifier === event.identifier);
      if (!failed?.playlistContext || failed.sourceTrack.offlineInfo?.isPlayableOffline()) {
        return;
      }

      const trackId = trackIdForSourceTrack(failed.sourceTrack);
      const availability = (await resolvePlaylistTracks(realm, apiClient, [trackId])).get(trackId);
      if (availability !== 'unavailable' && availability !== 'retired') {
        return;
      }

      // A late answer only records availability; the listener may have moved on.
      if (player.queue.currentTrack?.identifier !== failed.identifier) {
        return;
      }
      if (Date.now() - lastSkipAt > SKIP_STREAK_RESET_MS) {
        skipsInARow = 0;
      }
      if (skipsInARow >= MAX_SKIPS_IN_A_ROW) {
        return;
      }
      skipsInARow++;
      lastSkipAt = Date.now();
      player.next();
    };

    latestError.addListener(onError);
    return () => {
      latestError.removeListener(onError);
    };
  }, [apiClient, player, realm]);

  return null;
}
