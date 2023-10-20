import { RelistenErrorEvent, RelistenPlaybackState } from '@/modules/relisten-audio-player';

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

type SharedStateListener<T> = (value: T) => void;

export class SharedState<T> {
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

export const latestError = new SharedState<RelistenErrorEvent>();
export const state = new SharedState<RelistenPlaybackState>();
export const currentTrackIdentifier = new SharedState<string | undefined>();
export const progress = new SharedState<PlaybackContextProgress>();
export const activeTrackDownloadProgress = new SharedState<PlaybackContextDownloadProgress>();

export const sharedStates = {
  latestError,
  state,
  currentTrackIdentifier,
  progress,
  activeTrackDownloadProgress,
};
