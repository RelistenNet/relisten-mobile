import { EventEmitter, NativeModulesProxy, Subscription } from 'expo-modules-core';

// Import the native module. On web, it will be resolved to RelistenAudioPlayer.web.ts
// and on native platforms to RelistenAudioPlayer.ts
import RelistenAudioPlayerModule from './src/RelistenAudioPlayerModule';

const emitter = new EventEmitter(
  RelistenAudioPlayerModule ?? NativeModulesProxy.RelistenAudioPlayer
);

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
  addErrorListener(listener: (event: RelistenErrorEvent) => void): Subscription {
    return emitter.addListener<RelistenErrorEvent>('onError', listener);
  }

  removeListener(subscription: Subscription) {
    emitter.removeSubscription(subscription);
  }

  addPlaybackStateListener(
    listener: (event: RelistenPlaybackStateChangedEvent) => void
  ): Subscription {
    return emitter.addListener<RelistenPlaybackStateChangedEvent>(
      'onPlaybackStateChanged',
      listener
    );
  }

  addPlaybackProgressListener(
    listener: (event: RelistenPlaybackProgressChangedEvent) => void
  ): Subscription {
    return emitter.addListener<RelistenPlaybackProgressChangedEvent>(
      'onPlaybackProgressChanged',
      listener
    );
  }

  addDownloadProgressListener(
    listener: (event: RelistenDownloadProgressChangedEvent) => void
  ): Subscription {
    return emitter.addListener<RelistenDownloadProgressChangedEvent>(
      'onDownloadProgressChanged',
      listener
    );
  }

  addTrackChangedListener(listener: (event: RelistenTrackChangedEvent) => void): Subscription {
    return emitter.addListener<RelistenTrackChangedEvent>('onTrackChanged', listener);
  }

  addRemoteControlListener(listener: (event: RelistenRemoteControlEvent) => void): Subscription {
    return emitter.addListener<RelistenRemoteControlEvent>('onRemoteControl', listener);
  }

  addTrackStreamingCacheCompleteListener(
    listener: (event: RelistenTrackStreamingCacheCompleteEvent) => void
  ): Subscription {
    return emitter.addListener<RelistenTrackStreamingCacheCompleteEvent>(
      'onTrackStreamingCacheComplete',
      listener
    );
  }

  get currentState(): `${RelistenPlaybackState}` {
    return RelistenAudioPlayerModule.currentStateStr();
  }

  get currentDuration(): number | undefined {
    return RelistenAudioPlayerModule.currentDuration();
  }

  get elapsed(): number | undefined {
    return RelistenAudioPlayerModule.elapsed();
  }

  get volume(): number {
    return RelistenAudioPlayerModule.volume();
  }

  set volume(newVolume: number) {
    RelistenAudioPlayerModule.setVolume(newVolume);
  }

  playbackProgress(): Promise<PlaybackProgress> {
    return RelistenAudioPlayerModule.playbackProgress();
  }

  play(streamable: RelistenStreamable): Promise<void> {
    return RelistenAudioPlayerModule.play(streamable);
  }

  setNextStream(streamable?: RelistenStreamable) {
    RelistenAudioPlayerModule.setNextStream(streamable);
  }

  resume(): Promise<void> {
    return RelistenAudioPlayerModule.resume();
  }

  pause(): Promise<void> {
    return RelistenAudioPlayerModule.pause();
  }

  stop(): Promise<void> {
    return RelistenAudioPlayerModule.stop();
  }

  next(): Promise<void> {
    return RelistenAudioPlayerModule.next();
  }

  prepareAudioSession() {
    RelistenAudioPlayerModule.prepareAudioSession();
  }

  seekTo(pct: number): Promise<void> {
    return RelistenAudioPlayerModule.seekTo(pct);
  }
}

export const nativePlayer = new RelistenGaplessPlayer();
