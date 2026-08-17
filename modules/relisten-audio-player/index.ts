import { EventEmitter, EventSubscription } from 'expo-modules-core';

// Import the native module. On web, it will be resolved to RelistenAudioPlayer.web.ts
// and on native platforms to RelistenAudioPlayer.ts
import RelistenAudioPlayerModule from './src/RelistenAudioPlayerModule';
import { log } from '@/relisten/util/logging';

const logger = log.extend('relisten-audio-player');

function normalizeNativeTimeMs(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  const milliseconds = Math.floor(value);
  return Number.isSafeInteger(milliseconds) ? Math.max(0, milliseconds) : undefined;
}

const emitter = new EventEmitter<{
  onError: (event: RelistenErrorEvent) => void;
  onPlaybackStateChanged: (event: RelistenPlaybackStateChangedEvent) => void;
  onPlaybackProgressChanged: (event: RelistenPlaybackProgressChangedEvent) => void;
  onDownloadProgressChanged: (event: RelistenDownloadProgressChangedEvent) => void;
  onTrackChanged: (event: RelistenTrackChangedEvent) => void;
  onRemoteControl: (event: RelistenRemoteControlEvent) => void;
  onTrackStreamingCacheComplete: (event: RelistenTrackStreamingCacheCompleteEvent) => void;
}>(RelistenAudioPlayerModule);

export interface RelistenStreamable {
  url: string;
  identifier: string;
  cacheKey: string;
  title: string;
  artist: string;
  albumTitle: string;
  albumArt: string;
  downloadDestination?: string;
}

export enum RelistenPlaybackState {
  Stopped = 'Stopped',
  Playing = 'Playing',
  Paused = 'Paused',
  Stalled = 'Stalled',
}

export enum RelistenPlaybackErrorKind {
  InvalidSource = 'invalidSource',
  NetworkUnavailable = 'networkUnavailable',
  NetworkTimeout = 'networkTimeout',
  SslFailure = 'sslFailure',
  HttpStatus = 'httpStatus',
  SourceNotFound = 'sourceNotFound',
  InvalidMedia = 'invalidMedia',
  InsufficientData = 'insufficientData',
  UnsupportedFormat = 'unsupportedFormat',
  IncompatibleTracks = 'incompatibleTracks',
  SourceIdentityMismatch = 'sourceIdentityMismatch',
  InvalidState = 'invalidState',
  AudioPipeline = 'audioPipeline',
  Unknown = 'unknown',
}

export type RelistenPlaybackErrorPlatform = 'ios' | 'android';

export interface RelistenPlaybackError {
  kind: RelistenPlaybackErrorKind;
  message: string;
  description?: string;
  isRetryable: boolean;
  platform: RelistenPlaybackErrorPlatform;
  platformCode?: number;
  platformName?: string;
  httpStatus?: number;
}

export interface RelistenErrorEvent {
  error: RelistenPlaybackError;
  identifier: string | undefined;
}

export interface RelistenPlaybackStateChangedEvent {
  newPlaybackState: RelistenPlaybackState;
}

export interface RelistenPlaybackProgressChangedEvent {
  elapsed: number | undefined;
  duration: number | undefined;
}

export interface RelistenDownloadProgressChangedEvent {
  forActiveTrack: boolean;
  downloadedBytes: number;
  totalBytes: number;
}

export interface RelistenTrackChangedEvent {
  previousIdentifier?: string;
  currentIdentifier?: string;
}

export interface RelistenRemoteControlEvent {
  method?: string;
}

export interface RelistenTrackStreamingCacheCompleteEvent {
  identifier: string;
  totalBytes: number;
}

export interface PlaybackProgress {
  playbackProgress: RelistenPlaybackProgressChangedEvent;
  activeTrackDownloadProgress: RelistenDownloadProgressChangedEvent;
}

class RelistenGaplessPlayer {
  addErrorListener(listener: (event: RelistenErrorEvent) => void): EventSubscription {
    return emitter.addListener('onError', listener);
  }

  addPlaybackStateListener(
    listener: (event: RelistenPlaybackStateChangedEvent) => void
  ): EventSubscription {
    return emitter.addListener('onPlaybackStateChanged', listener);
  }

  addPlaybackProgressListener(
    listener: (event: RelistenPlaybackProgressChangedEvent) => void
  ): EventSubscription {
    return emitter.addListener('onPlaybackProgressChanged', listener);
  }

  addDownloadProgressListener(
    listener: (event: RelistenDownloadProgressChangedEvent) => void
  ): EventSubscription {
    return emitter.addListener('onDownloadProgressChanged', listener);
  }

  addTrackChangedListener(listener: (event: RelistenTrackChangedEvent) => void): EventSubscription {
    return emitter.addListener('onTrackChanged', listener);
  }

  addRemoteControlListener(
    listener: (event: RelistenRemoteControlEvent) => void
  ): EventSubscription {
    return emitter.addListener('onRemoteControl', listener);
  }

  addTrackStreamingCacheCompleteListener(
    listener: (event: RelistenTrackStreamingCacheCompleteEvent) => void
  ): EventSubscription {
    return emitter.addListener('onTrackStreamingCacheComplete', listener);
  }

  get currentState(): `${RelistenPlaybackState}` {
    logger.debug('get currentState called');
    return RelistenAudioPlayerModule.currentStateStr();
  }

  get currentDuration(): number | undefined {
    logger.debug('get currentDuration called');
    return RelistenAudioPlayerModule.currentDuration();
  }

  get elapsed(): number | undefined {
    logger.debug('get elapsed called');
    return RelistenAudioPlayerModule.elapsed();
  }

  get volume(): number {
    logger.debug('get volume called');
    return RelistenAudioPlayerModule.volume();
  }

  set volume(newVolume: number) {
    logger.debug('set volume called');
    RelistenAudioPlayerModule.setVolume(newVolume);
  }

  playbackProgress(): Promise<PlaybackProgress> {
    logger.debug('playbackProgress called');
    return RelistenAudioPlayerModule.playbackProgress();
  }

  play(streamable: RelistenStreamable, startingAtMs?: number): Promise<void> {
    const nativeStartingAtMs = normalizeNativeTimeMs(startingAtMs);

    if (startingAtMs !== undefined && nativeStartingAtMs === undefined) {
      logger.warn('Ignoring invalid native playback start time', { startingAtMs });
    }

    logger.debug(`play called startingAtMs=${nativeStartingAtMs}`, streamable);
    return RelistenAudioPlayerModule.play(streamable, nativeStartingAtMs);
  }

  setNextStream(streamable?: RelistenStreamable) {
    logger.debug('setNextStream called', streamable);
    RelistenAudioPlayerModule.setNextStream(streamable);
  }

  setRepeatMode(repeatMode: number) {
    logger.debug('setRepeatMode called', repeatMode);
    RelistenAudioPlayerModule.setRepeatMode(repeatMode);
  }

  setShuffleMode(shuffleMode: number) {
    logger.debug('setShuffleMode called', shuffleMode);
    RelistenAudioPlayerModule.setShuffleMode(shuffleMode);
  }

  resume(): Promise<void> {
    logger.debug('resume called');
    return RelistenAudioPlayerModule.resume();
  }

  pause(): Promise<void> {
    logger.debug('pause called');
    return RelistenAudioPlayerModule.pause();
  }

  private stopPromise: Promise<void> | undefined = undefined;
  stop(): Promise<void> {
    if (this.stopPromise) {
      logger.debug('stop already in flight; returning the same promise');
      return this.stopPromise;
    }

    logger.debug('stop called');
    const stopPromise = RelistenAudioPlayerModule.stop();

    stopPromise.then(() => {
      this.stopPromise = undefined;
    });

    this.stopPromise = stopPromise;

    return stopPromise;
  }

  next(): Promise<void> {
    logger.debug('next called');
    return RelistenAudioPlayerModule.next();
  }

  prepareAudioSession() {
    logger.debug('prepareAudioSession called');
    RelistenAudioPlayerModule.prepareAudioSession();
  }

  seekTo(pct: number): Promise<void> {
    logger.debug('seekTo called');
    return RelistenAudioPlayerModule.seekTo(pct);
  }

  seekToTime(timeMs: number): Promise<void> {
    const nativeTimeMs = normalizeNativeTimeMs(timeMs);

    if (nativeTimeMs === undefined) {
      logger.warn('Ignoring invalid native seek time', { timeMs });
      return Promise.resolve();
    }

    logger.debug('seekToTime called', { timeMs: nativeTimeMs });
    return RelistenAudioPlayerModule.seekToTime(nativeTimeMs);
  }
}

export const nativePlayer = new RelistenGaplessPlayer();
