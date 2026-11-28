import { useEffect } from 'react';
import Realm from 'realm';
import { type RelistenErrorEvent, RelistenPlaybackState } from '@/modules/relisten-audio-player';
import type { RelistenApiClient } from '@/relisten/api/client';
import { useRelistenApi } from '@/relisten/api/context';
import type { RelistenPlayer } from '@/relisten/player/relisten_player';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { latestError, state as playbackState } from '@/relisten/player/shared_state';
import { useRealm } from '@/relisten/realm/schema';
import { trackIdForSourceTrack } from '@/relisten/playlists/playlist_hooks';
import { resolvePlaylistTracks } from '@/relisten/playlists/playlist_hydration';

/** Stops an offline device from racing through the queue skipping every track. */
const MAX_SKIPS_IN_A_ROW = 3;
/**
 * A failed playlist track is the only time a cached track is re-checked. If the
 * catalog says the recording is gone, it is marked unavailable and, if the
 * listener hasn't given another command meanwhile, the player moves on. The
 * player's own error toast and logging are unchanged.
 */
export function createFailureHandler(
  realm: Realm,
  catalogApi: RelistenApiClient,
  player: RelistenPlayer
) {
  // Skips since playback last started or the queue last changed.
  let skips = 0;
  const checking = new Set<string>();

  const onError = async (event: RelistenErrorEvent) => {
    const failed = player.queue.orderedTracks.find((t) => t.identifier === event.identifier);
    if (
      !failed?.playlistContext ||
      !failed.sourceTrack.isValid() ||
      failed.sourceTrack.offlineInfo?.isPlayableOffline() ||
      checking.has(failed.identifier)
    ) {
      return;
    }

    const commandVersion = player.playCommandVersion;
    const trackId = trackIdForSourceTrack(failed.sourceTrack);
    checking.add(failed.identifier);
    let availability;
    try {
      availability = (await resolvePlaylistTracks(realm, catalogApi, [trackId])).get(trackId);
    } finally {
      checking.delete(failed.identifier);
    }
    if (availability !== 'unavailable' && availability !== 'retired') {
      return;
    }

    // A late answer only records availability: a play, skip, or stop since the
    // error belongs to the listener, so it must not be overridden here.
    if (
      player.playCommandVersion !== commandVersion ||
      player.queue.currentTrack?.identifier !== failed.identifier ||
      skips >= MAX_SKIPS_IN_A_ROW
    ) {
      return;
    }
    skips += 1;
    player.next();
  };

  const resetSkips = () => {
    skips = 0;
  };
  const onStateChanged = (playbackState: RelistenPlaybackState) => {
    if (playbackState === RelistenPlaybackState.Playing) {
      resetSkips();
    }
  };

  latestError.addListener(onError);
  playbackState.addListener(onStateChanged);
  const removeQueueListener = player.queue.onOrderedTracksChanged.addListener(resetSkips);
  return () => {
    latestError.removeListener(onError);
    playbackState.removeListener(onStateChanged);
    removeQueueListener();
  };
}

export function PlaylistPlaybackRecovery() {
  const realm = useRealm();
  const player = useRelistenPlayer();
  const { apiClient } = useRelistenApi();

  useEffect(() => createFailureHandler(realm, apiClient, player), [apiClient, player, realm]);

  return null;
}
