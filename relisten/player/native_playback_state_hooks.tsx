// Bridges native notifications to shared playback state and exposes React hooks.
// RelistenPlayer checks track and progress events against pending play requests before publication.
import {
  nativePlayer,
  RelistenDownloadProgressChangedEvent,
  RelistenErrorEvent,
  RelistenPlaybackStateChangedEvent,
  RelistenRemoteControlEvent,
  RelistenTrackStreamingCacheCompleteEvent,
} from '@/modules/relisten-audio-player';
import { PlaybackSource, sharedStates } from '@/relisten/player/shared_state';
import { SharedState } from '@/relisten/util/shared_state';
import { useEffect, useState } from 'react';

let listenersRegisters = false;

// Native download totals can briefly disagree during terminal HTTP/cache transitions.
// Clamp before the UI derives buffered width so the scrubber never renders past-full or zeroes on bad data.
function clampPercent(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, numerator / denominator));
}

/** Register once for the process; playback hooks may call this repeatedly. */
export function addPlayerListeners() {
  if (listenersRegisters) {
    return;
  }
  listenersRegisters = true;

  const shouldUseNativeUpdates = () =>
    sharedStates.playbackSource.lastState() !== PlaybackSource.Cast;

  const download = nativePlayer.addDownloadProgressListener(
    (download: RelistenDownloadProgressChangedEvent) => {
      // only update download progress for active track for now
      // later we may want to have data for the next track
      if (download.forActiveTrack && shouldUseNativeUpdates()) {
        sharedStates.activeTrackDownloadProgress.setState({
          downloadedBytes: download.downloadedBytes,
          totalBytes: download.totalBytes,
          percent: clampPercent(download.downloadedBytes, download.totalBytes),
        });
      }
    }
  );

  const playback = nativePlayer.addPlaybackStateListener(
    (playbackState: RelistenPlaybackStateChangedEvent) => {
      if (shouldUseNativeUpdates()) {
        sharedStates.state.setState(playbackState.newPlaybackState);
      }
    }
  );

  const remoteControlListener = nativePlayer.addRemoteControlListener(
    (event: RelistenRemoteControlEvent) => {
      sharedStates.remoteControlEvent.setState(event);
    }
  );

  const latestErrorListener = nativePlayer.addErrorListener((latestError: RelistenErrorEvent) => {
    if (shouldUseNativeUpdates()) {
      sharedStates.latestError.setState(latestError);
    }
  });

  const trackStreamingCacheCompleteListener = nativePlayer.addTrackStreamingCacheCompleteListener(
    (event: RelistenTrackStreamingCacheCompleteEvent) => {
      if (shouldUseNativeUpdates()) {
        sharedStates.trackStreamingCacheComplete.setState(event);
      }
    }
  );

  return () => {
    download.remove();
    playback.remove();
    latestErrorListener.remove();
    remoteControlListener.remove();
    trackStreamingCacheCompleteListener.remove();
  };
}

function createPlaybackHook<T>(sharedState: SharedState<T>) {
  return () => {
    addPlayerListeners();

    const [state, setState] = useState<T | undefined>(sharedState.lastState());

    useEffect(() => {
      const listener = (newState: T) => {
        setState(newState);
      };

      sharedState.addListener(listener);

      return () => {
        sharedState.removeListener(listener);
      };
    }, [setState]);

    return state;
  };
}

/** Reads progress published by the player or the active Cast driver. */
export const useNativePlaybackProgress = createPlaybackHook(sharedStates.progress);
/** Reads download progress for the active track, excluding prebuffered tracks. */
export const useNativeActiveTrackDownloadProgress = createPlaybackHook(
  sharedStates.activeTrackDownloadProgress
);
