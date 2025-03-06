import {
  nativePlayer,
  RelistenErrorEvent,
  RelistenPlaybackErrorToName,
  RelistenPlaybackState,
  RelistenRemoteControlEvent,
  RelistenTrackStreamingCacheCompleteEvent,
} from '@/modules/relisten-audio-player';
import {
  latestError,
  PlaybackContextProgress,
  progress,
  remoteControlEvent,
  state,
  trackStreamingCacheComplete,
} from '@/relisten/player/shared_state';
import { addPlayerListeners } from '@/relisten/player/native_playback_state_hooks';
import { PlayerQueueTrack, RelistenPlayerQueue } from '@/relisten/player/relisten_player_queue';
import { EventSource } from '@/relisten/util/event_source';
import { DownloadManager } from '@/relisten/offline/download_manager';
import { showMessage } from 'react-native-flash-message';
import { log } from '@/relisten/util/logging';
import { indentString } from '@/relisten/util/string_indent';
import { realm } from '@/relisten/realm/schema';
import { UserSettings } from '@/relisten/realm/models/user_settings';

const logger = log.extend('player');

export interface RelistenPlayerReportTrackEvent {
  playbackStartedAt: Date;
  playerQueueTrack: PlayerQueueTrack;
}

export class RelistenPlayer {
  static DEFAULT_INSTANCE = new RelistenPlayer();

  constructor() {}

  dispose() {
    this.removePlayerListeners();
  }

  private _queue: RelistenPlayerQueue = new RelistenPlayerQueue(this);

  private _state: RelistenPlaybackState = RelistenPlaybackState.Stopped;
  private _stalledTimer: number | undefined = undefined;
  private seekIntent: number | undefined = undefined;
  private updateSavedStateOnNextProgress: boolean = false;

  public progress: PlaybackContextProgress | undefined = undefined;

  // region Public API
  onStateChanged = new EventSource<RelistenPlaybackState>();
  onShouldReportTrack = new EventSource<RelistenPlayerReportTrackEvent>();

  public enableStreamingCache: boolean = true;
  public playbackIntentStarted: boolean = false;
  // When true, it means the native player should be fully initialized
  public initialPlaybackStarted: boolean = false;

  get state() {
    this.addPlayerListeners();

    return this._state;
  }

  get queue() {
    this.addPlayerListeners();

    return this._queue;
  }

  togglePauseResume() {
    this.addPlayerListeners();

    if (this.state === RelistenPlaybackState.Playing) {
      this.pause();
      return;
    }

    this.resume();
  }

  resume() {
    this.addPlayerListeners();

    if (this.state === RelistenPlaybackState.Stopped) {
      if (this.queue.orderedTracks.length > 0) {
        this.playTrackAtIndex(this.queue.currentIndex ?? 0, this.seekIntent);
        this.seekIntent = undefined;
      }

      return;
    }

    state.setState(RelistenPlaybackState.Playing);
    nativePlayer.resume().then(() => {});
  }

  pause() {
    this.addPlayerListeners();

    state.setState(RelistenPlaybackState.Paused);
    nativePlayer.pause().then(() => {});
  }

  playTrackAtIndex(index: number, seekToTime?: number) {
    const newIndex = Math.max(0, Math.min(index, this.queue.orderedTracks.length - 1));

    this._stalledTimer = setTimeout(() => {
      if (this.state != RelistenPlaybackState.Playing) {
        state.setState(RelistenPlaybackState.Stalled);
      }
    }, 250) as unknown as number;

    nativePlayer
      .play(
        this.queue.orderedTracks[newIndex].toStreamable(this.enableStreamingCache),
        seekToTime !== undefined ? seekToTime * 1000.0 : undefined
      )
      .then(() => {});

    if (seekToTime !== undefined) {
      this.updateSavedStateOnNextProgress = true;
    }

    this.playbackIntentStarted = true;

    this.queue.recalculateNextTrack();
  }

  async stop() {
    this.addPlayerListeners();

    state.setState(RelistenPlaybackState.Stopped);
    await nativePlayer.stop();
  }

  next() {
    this.addPlayerListeners();

    nativePlayer.next().then(() => {});
  }

  previous() {
    this.addPlayerListeners();

    const currentIdx = this.queue.currentIndex;

    if (!currentIdx) {
      return;
    }

    // TODO: if track.elapsed > 10 then instead of
    // switching to prior track, just restart the current one
    // if elapsed < 10, then go to prior track.

    this.playTrackAtIndex(currentIdx - 1);
  }

  prepareAudioSession() {
    this.addPlayerListeners();

    nativePlayer.prepareAudioSession();
  }

  seekTo(pct: number): Promise<void> {
    this.addPlayerListeners();

    // We cannot seek if we aren't playing. Save this for when attempt to play.
    if (this.state == RelistenPlaybackState.Stopped) {
      return Promise.resolve();
    }

    return nativePlayer.seekTo(pct);
  }

  seekToTime(time: number): Promise<void> {
    this.addPlayerListeners();

    // We cannot seek if we aren't playing. Save this for when attempt to play.
    if (this.state == RelistenPlaybackState.Stopped) {
      this.seekIntent = time;
      return Promise.resolve();
    }

    return nativePlayer.seekToTime(time * 1000.0);
  }

  debugState() {
    return `
RelistenPlayer
  state=${this.state}
  
${indentString(this.queue.debugState(true))}
    `.trim();
  }

  // endregion

  // region Player event handling
  private addedPlayerListeners = false;

  private addPlayerListeners() {
    if (this.addedPlayerListeners) {
      return;
    }

    addPlayerListeners();
    state.addListener(this.onNativePlayerStateChanged);
    latestError.addListener(this.onNativePlayerError);
    remoteControlEvent.addListener(this.onRemoteControlEvent);
    trackStreamingCacheComplete.addListener(this.onTrackStreamingCacheComplete);
    progress.addListener(this.onProgress);
    this._queue.addPlayerListeners();

    this.addedPlayerListeners = true;
  }

  private removePlayerListeners() {
    if (!this.addedPlayerListeners) {
      return;
    }

    state.removeListener(this.onNativePlayerStateChanged);
    latestError.removeListener(this.onNativePlayerError);
    remoteControlEvent.removeListener(this.onRemoteControlEvent);
    trackStreamingCacheComplete.removeListener(this.onTrackStreamingCacheComplete);
    progress.removeListener(this.onProgress);
    this._queue.removePlayerListeners();

    this.addedPlayerListeners = false;
  }

  private onProgress = (progress: PlaybackContextProgress) => {
    if (
      this.progress &&
      this.progress.percent <= 0.05 &&
      progress.percent > 0.05 &&
      this.queue.currentTrack
    ) {
      const currentTrack = this.queue.currentTrack;

      this.onShouldReportTrack.dispatch({
        playerQueueTrack: currentTrack,
        playbackStartedAt: this.queue.currentTrackPlaybackStartedAt || new Date(),
      });
    }

    // save state based on playback every 5 seconds
    if (this.updateSavedStateOnNextProgress || Math.floor(progress.elapsed) % 5 === 0) {
      this.updateSavedStateOnNextProgress = false;
      this.queue.savePlayerState();
    }

    this.progress = progress;
  };

  private onNativePlayerStateChanged = (newState: RelistenPlaybackState) => {
    logger.debug('onNativePlayerStateChanged', newState);

    // Clear the default stalled UI fallback
    if (this._stalledTimer === undefined) {
      clearTimeout(this._stalledTimer);
      this._stalledTimer = undefined;
    }

    if (!this.initialPlaybackStarted && newState == RelistenPlaybackState.Playing) {
      this.initialPlaybackStarted = true;
    }

    if (this._state != newState) {
      this._state = newState;
      this.onStateChanged.dispatch(newState);
    }
  };

  private onRemoteControlEvent = (event: RelistenRemoteControlEvent) => {
    if (event.method === 'prevTrack') {
      this.previous();
    }
  };

  private onTrackStreamingCacheComplete = (event: RelistenTrackStreamingCacheCompleteEvent) => {
    for (const track of this.queue.orderedTracks) {
      if (track.identifier === event.identifier) {
        DownloadManager.SHARED_INSTANCE.markCachedFileAsAvailableOffline(
          track.sourceTrack,
          event.totalBytes
        );

        // no need to refresh the next track to make it play from disk--it is already pre-buffered.
      }
    }
  };

  private onNativePlayerError = (error: RelistenErrorEvent) => {
    logger.error('Native playback error', error);

    showMessage({
      message: 'Error: ' + (error.errorMessage ?? RelistenPlaybackErrorToName[error.error]),
      description: error.errorDescription,
      type: 'danger',
      duration: 10_000,
    });
  };
  // endregion
}
