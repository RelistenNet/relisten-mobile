import {
  RelistenErrorEvent,
  RelistenPlaybackState,
  RelistenRemoteControlEvent,
  RelistenTrackStreamingCacheCompleteEvent,
} from '@/modules/relisten-audio-player';
import { SharedState } from '@/relisten/util/shared_state';

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

export enum PlaybackSource {
  Native = 'native',
  Cast = 'cast',
  Sonos = 'sonos',
}

export const latestError = new SharedState<RelistenErrorEvent>();
export const state = new SharedState<RelistenPlaybackState>();
export const currentTrackIdentifier = new SharedState<string | undefined>();
export const progress = new SharedState<PlaybackContextProgress>();
export const activeTrackDownloadProgress = new SharedState<PlaybackContextDownloadProgress>();
export const remoteControlEvent = new SharedState<RelistenRemoteControlEvent>();
export const trackStreamingCacheComplete =
  new SharedState<RelistenTrackStreamingCacheCompleteEvent>();
export const playbackSource = new SharedState<PlaybackSource>();

/** Whether another device plays the queue, so the phone's own player must not report state. */
export function isRemotePlayback(): boolean {
  return isRemoteSource(playbackSource.lastState());
}

/** A source not yet published means the phone, as before any remote player connects. */
export function isRemoteSource(source: PlaybackSource | undefined): boolean {
  return source !== undefined && source !== PlaybackSource.Native;
}

export const sharedStates = {
  latestError,
  state,
  currentTrackIdentifier,
  progress,
  activeTrackDownloadProgress,
  remoteControlEvent,
  trackStreamingCacheComplete,
  playbackSource,
};
