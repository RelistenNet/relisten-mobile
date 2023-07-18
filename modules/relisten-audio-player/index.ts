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
}

export enum RelistenPlaybackState {
  Stopped = 'Stopped',
  Playing = 'Playing',
  Paused = 'Paused',
  Stalled = 'Stalled',
}

export enum RelistenPlaybackError {
  Init = 'Init',
  NotAvail = 'NotAvail',
  NoInternet = 'NoInternet',
  InvalidUrl = 'InvalidUrl',
  SslUnsupported = 'SslUnsupported',
  ServerTimeout = 'ServerTimeout',
  CouldNotOpenFile = 'CouldNotOpenFile',
  FileInvalidFormat = 'FileInvalidFormat',
  SupportedCodec = 'SupportedCodec',
  UnsupportedSampleFormat = 'UnsupportedSampleFormat',
  InsufficientMemory = 'InsufficientMemory',
  No3D = 'No3D',
  Unknown = 'Unknown',
}

export interface RelistenErrorEvent {
  error: RelistenPlaybackError;
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
  previousIdentifier: string;
  currentIdentifier: string;
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
    listener: (event: RelistenPlaybackStateChangedEvent) => void
  ): Subscription {
    return emitter.addListener<RelistenPlaybackStateChangedEvent>(
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

  get currentState(): `${RelistenPlaybackState}` {
    return RelistenAudioPlayerModule.currentStateStr();
  }

  get currentDuration(): number {
    return RelistenAudioPlayerModule.currentDuration();
  }

  get elapsed(): number {
    return RelistenAudioPlayerModule.elapsed();
  }

  get volume(): number {
    return RelistenAudioPlayerModule.volume();
  }

  set volume(newVolume: number) {
    RelistenAudioPlayerModule.setVolume(newVolume);
  }

  get DEBUG_STATE() {
    return RelistenAudioPlayerModule.getDebugState();
  }

  set DEBUG_STATE(newState: string) {
    RelistenAudioPlayerModule.setDebugState(newState);
  }

  play(streamable: RelistenStreamable) {
    RelistenAudioPlayerModule.play(streamable);
  }

  setNextStream(streamable: RelistenStreamable) {
    RelistenAudioPlayerModule.setNextStream(streamable);
  }

  resume() {
    RelistenAudioPlayerModule.resume();
  }

  pause() {
    RelistenAudioPlayerModule.pause();
  }

  stop() {
    RelistenAudioPlayerModule.stop();
  }

  next() {
    RelistenAudioPlayerModule.next();
  }

  prepareAudioSession() {
    RelistenAudioPlayerModule.next();
  }

  seekTo(pct: number) {
    RelistenAudioPlayerModule.seekTo(pct);
  }
}

export const player = new RelistenGaplessPlayer();
