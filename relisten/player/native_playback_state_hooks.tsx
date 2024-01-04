import {
  nativePlayer,
  RelistenDownloadProgressChangedEvent,
  RelistenErrorEvent,
  RelistenPlaybackProgressChangedEvent,
  RelistenPlaybackStateChangedEvent,
  RelistenRemoteControlEvent,
  RelistenTrackChangedEvent,
  RelistenTrackStreamingCacheCompleteEvent,
} from '@/modules/relisten-audio-player';
import { sharedStates } from '@/relisten/player/shared_state';
import { SharedState } from '@/relisten/util/shared_state';
import { useEffect, useState } from 'react';

let listenersRegisters = false;

export function addPlayerListeners() {
  if (listenersRegisters) {
    return;
  }
  listenersRegisters = true;

  // console.log('[playback state] adding playback event listeners');

  const download = nativePlayer.addDownloadProgressListener(
    (download: RelistenDownloadProgressChangedEvent) => {
      // console.info('got download progress', download);

      // only update download progress for active track for now
      // later we may want to have data for the next track
      if (download.forActiveTrack) {
        sharedStates.activeTrackDownloadProgress.setState({
          downloadedBytes: download.downloadedBytes,
          totalBytes: download.totalBytes,
          percent: download.downloadedBytes / download.totalBytes,
        });
      }
    }
  );

  const listener = nativePlayer.addPlaybackProgressListener(
    (progress: RelistenPlaybackProgressChangedEvent) => {
      // console.info('got playback progress', progress);

      const newProgress = {
        elapsed: progress.elapsed ?? 0,
        duration: progress.duration ?? 0,
        percent: progress.duration ? (progress.elapsed ?? 0) / progress.duration : 0,
      };

      const lastProgress = sharedStates.progress.lastState();

      if (
        lastProgress === undefined ||
        Math.floor(lastProgress.elapsed) !== Math.floor(newProgress.elapsed)
      ) {
        sharedStates.progress.setState(newProgress);
      }
    }
  );

  const playback = nativePlayer.addPlaybackStateListener(
    (playbackState: RelistenPlaybackStateChangedEvent) => {
      // console.info('got playbackState', playbackState);

      sharedStates.state.setState(playbackState.newPlaybackState);
    }
  );

  const trackChangedListener = nativePlayer.addTrackChangedListener(
    (trackChanged: RelistenTrackChangedEvent) => {
      // console.info('got trackChanged', trackChanged);

      sharedStates.currentTrackIdentifier.setState(trackChanged.currentIdentifier);
    }
  );

  const remoteControlListener = nativePlayer.addRemoteControlListener(
    (event: RelistenRemoteControlEvent) => {
      // console.info('got remoteControl', event.method);

      sharedStates.remoteControlEvent.setState(event);
    }
  );

  const latestErrorListener = nativePlayer.addErrorListener((latestError: RelistenErrorEvent) => {
    // console.info('got latestError', latestError);

    sharedStates.latestError.setState(latestError);
  });

  const trackStreamingCacheCompleteListener = nativePlayer.addTrackStreamingCacheCompleteListener(
    (event: RelistenTrackStreamingCacheCompleteEvent) => {
      // console.info('got trackStreamingCacheComplete', event);

      sharedStates.trackStreamingCacheComplete.setState(event);
    }
  );

  return () => {
    download.remove();
    listener.remove();
    playback.remove();
    trackChangedListener.remove();
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

export const useNativePlaybackProgress = createPlaybackHook(sharedStates.progress);
export const useNativeActiveTrackDownloadProgress = createPlaybackHook(
  sharedStates.activeTrackDownloadProgress
);
