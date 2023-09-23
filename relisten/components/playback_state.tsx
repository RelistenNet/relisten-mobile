import { useEffect, useState } from 'react';
import { player, RelistenErrorEvent, RelistenPlaybackState } from '@/modules/relisten-audio-player';

export interface PlaybackContextDownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
}

export interface PlaybackContextProgress {
  elapsed: number;
  duration: number;
  percent: number;
}

export interface PlaybackContextState {
  latestError?: RelistenErrorEvent;
  state?: RelistenPlaybackState;
  currentTrackIdentifier?: string;
}

export interface PlaybackContextProps {
  state: PlaybackContextState;
  progress?: PlaybackContextProgress;
  activeTrackDownloadProgress?: PlaybackContextDownloadProgress;
}

type SharedStateListener<T> = (value: T) => void;
class SharedState<T> {
  private listeners: Array<SharedStateListener<T>> = [];
  private _lastState: T | undefined = undefined;

  addListener(listener: SharedStateListener<T>) {
    this.listeners.push(listener);
  }

  removeListener(listener: SharedStateListener<T>) {
    this.listeners.splice(this.listeners.indexOf(listener), 1);
  }

  setState(value: T) {
    if (value !== this._lastState) {
      for (const listener of this.listeners) {
        listener(value);
      }

      this._lastState = value;
    }
  }

  lastState(): T | undefined {
    return this._lastState;
  }
}

const sharedStates = {
  latestError: new SharedState<RelistenErrorEvent>(),
  state: new SharedState<RelistenPlaybackState>(),
  currentTrackIdentifier: new SharedState<string>(),
  progress: new SharedState<PlaybackContextProgress>(),
  activeTrackDownloadProgress: new SharedState<PlaybackContextDownloadProgress>(),
};

let listenersRegisters = false;

function addPlayerListeners() {
  if (listenersRegisters) {
    return;
  }
  listenersRegisters = true;

  console.log('[playback state] adding playback event listeners');

  const download = player.addDownloadProgressListener((download) => {
    console.info('got download progress', download);

    sharedStates.activeTrackDownloadProgress.setState({
      downloadedBytes: download.downloadedBytes,
      totalBytes: download.totalBytes,
      percent: download.downloadedBytes / download.totalBytes,
    });
  });

  const listener = player.addPlaybackProgressListener((progress) => {
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
  });

  const playback = player.addPlaybackStateListener((playbackState) => {
    console.info('got playbackState', playbackState);

    sharedStates.state.setState(playbackState.newPlaybackState);
  });

  const trackChangedListener = player.addTrackChangedListener((trackChanged) => {
    console.info('got trackChanged', trackChanged);

    sharedStates.currentTrackIdentifier.setState(trackChanged.currentIdentifier);
  });

  const latestErrorListener = player.addErrorListener((latestError) => {
    console.info('got latestError', latestError);

    sharedStates.latestError.setState(latestError);
  });

  return () => {
    download.remove();
    listener.remove();
    playback.remove();
    trackChangedListener.remove();
    latestErrorListener.remove();
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

export const usePlaybackState = createPlaybackHook(sharedStates.state);
export const usePlaybackProgress = createPlaybackHook(sharedStates.progress);
export const usePlaybackCurrentTrackIdentifier = createPlaybackHook(
  sharedStates.currentTrackIdentifier
);
export const useActiveTrackDownloadProgress = createPlaybackHook(
  sharedStates.activeTrackDownloadProgress
);
export const usePlaybackLatestError = createPlaybackHook(sharedStates.latestError);
