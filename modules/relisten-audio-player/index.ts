import { EventEmitter, EventSubscription } from 'expo-modules-core';

// Import the native module. On web, it will be resolved to RelistenAudioPlayer.web.ts
// and on native platforms to RelistenAudioPlayer.ts
import RelistenAudioPlayerModule from './src/RelistenAudioPlayerModule';
import { log } from '@/relisten/util/logging';

const logger = log.extend('relisten-audio-player');

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

export enum RelistenPlaybackError {
  Init,
  NotAvail,
  NoInternet,
  InvalidUrl,
  SslUnsupported,
  ServerTimeout,
  CouldNotOpenFile,
  FileInvalidFormat,
  SupportedCodec,
  UnsupportedSampleFormat,
  InsufficientMemory,
  No3D,
  Unknown,
  Timeout = 40,
}

export const RelistenPlaybackErrorToName = {
  // These are iOS specific right now
  [RelistenPlaybackError.Init]: 'Init',
  [RelistenPlaybackError.NotAvail]: 'NotAvail',
  [RelistenPlaybackError.NoInternet]: 'NoInternet',
  [RelistenPlaybackError.InvalidUrl]: 'InvalidUrl',
  [RelistenPlaybackError.SslUnsupported]: 'SslUnsupported',
  [RelistenPlaybackError.ServerTimeout]: 'ServerTimeout',
  [RelistenPlaybackError.CouldNotOpenFile]: 'CouldNotOpenFile',
  [RelistenPlaybackError.FileInvalidFormat]: 'FileInvalidFormat',
  [RelistenPlaybackError.SupportedCodec]: 'SupportedCodec',
  [RelistenPlaybackError.UnsupportedSampleFormat]: 'UnsupportedSampleFormat',
  [RelistenPlaybackError.InsufficientMemory]: 'InsufficientMemory',
  [RelistenPlaybackError.No3D]: 'No3D',
  [RelistenPlaybackError.Unknown]: 'Unknown',
  [RelistenPlaybackError.Timeout]: 'Server Timeout',
};

export interface RelistenErrorEvent {
  error: RelistenPlaybackError;
  errorMessage: string;
  errorDescription: string;
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
    startingAtMs = startingAtMs !== undefined ? Math.floor(startingAtMs) : undefined;
    logger.debug(`play called startingAtMs=${startingAtMs}`, streamable);
    return RelistenAudioPlayerModule.play(streamable, startingAtMs);
  }

  setNextStream(streamable?: RelistenStreamable) {
    logger.debug('setNextStream called', streamable);
    RelistenAudioPlayerModule.setNextStream(streamable);
  }

  resume(): Promise<void> {
    logger.debug('resume called');
    return RelistenAudioPlayerModule.resume();
  }

  pause(): Promise<void> {
    logger.debug('pause called');
    return RelistenAudioPlayerModule.pause();
  }

  stop(): Promise<void> {
    logger.debug('stop called');
    return RelistenAudioPlayerModule.stop();
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
    logger.debug('seekToTime called');
    return RelistenAudioPlayerModule.seekToTime(timeMs);
  }
}

export const nativePlayer = new RelistenGaplessPlayer();
