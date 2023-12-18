import {
  RelistenDownloadProgressChangedEvent,
  RelistenErrorEvent,
  RelistenPlaybackProgressChangedEvent,
  RelistenPlaybackStateChangedEvent,
  RelistenRemoteControlEvent,
  RelistenTrackChangedEvent,
  nativePlayer,
} from '@/modules/relisten-audio-player';
import { sharedStates } from '@/relisten/player/shared_state';
import { SharedState } from '@/relisten/util/shared_state';
import { useEffect, useState } from 'react';
import { RelistenPlayer } from './relisten_player';

let listenersRegisters = false;

export function addPlayerListeners(player: RelistenPlayer) {
  if (listenersRegisters) {
    return;
  }
  listenersRegisters = true;

  console.log('[playback state] adding playback event listeners');

  const download = nativePlayer.addDownloadProgressListener(
    (download: RelistenDownloadProgressChangedEvent) => {
      console.info('got download progress', download);

      sharedStates.activeTrackDownloadProgress.setState({
        downloadedBytes: download.downloadedBytes,
        totalBytes: download.totalBytes,
        percent: download.downloadedBytes / download.totalBytes,
      });
    }
  );

  const listener = nativePlayer.addPlaybackProgressListener(
    (progress: RelistenPlaybackProgressChangedEvent) => {
      console.info('got playback progress', progress);

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
      console.info('got playbackState', playbackState);

      sharedStates.state.setState(playbackState.newPlaybackState);
    }
  );

  const trackChangedListener = nativePlayer.addTrackChangedListener(
    (trackChanged: RelistenTrackChangedEvent) => {
      console.info('got trackChanged', trackChanged);

      sharedStates.currentTrackIdentifier.setState(trackChanged.currentIdentifier);
    }
  );

  const remoteControlListener = nativePlayer.addRemoteControlListener(
    (event: RelistenRemoteControlEvent) => {
      console.info('got remoteControl', event.method);

      if (event.method === 'prevTrack') {
        player.previous();
      }

      // sharedStates.currentTrackIdentifier.setState(trackChanged.currentIdentifier);
    }
  );

  const latestErrorListener = nativePlayer.addErrorListener((latestError: RelistenErrorEvent) => {
    console.info('got latestError', latestError);

    sharedStates.latestError.setState(latestError);
  });

  return () => {
    download.remove();
    listener.remove();
    playback.remove();
    trackChangedListener.remove();
    latestErrorListener.remove();
    return remoteControlListener.remove();
  };
}

function createPlaybackHook<T>(sharedState: SharedState<T>) {
  return (player: RelistenPlayer) => {
    addPlayerListeners(player);

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
