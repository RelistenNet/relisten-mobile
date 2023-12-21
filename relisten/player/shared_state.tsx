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

export const latestError = new SharedState<RelistenErrorEvent>();
export const state = new SharedState<RelistenPlaybackState>();
export const currentTrackIdentifier = new SharedState<string | undefined>();
export const progress = new SharedState<PlaybackContextProgress>();
export const activeTrackDownloadProgress = new SharedState<PlaybackContextDownloadProgress>();
export const remoteControlEvent = new SharedState<RelistenRemoteControlEvent>();
export const trackStreamingCacheComplete =
  new SharedState<RelistenTrackStreamingCacheCompleteEvent>();

export const sharedStates = {
  latestError,
  state,
  currentTrackIdentifier,
  progress,
  activeTrackDownloadProgress,
  remoteControlEvent,
  trackStreamingCacheComplete,
};
