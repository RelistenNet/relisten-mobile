import {
  nativePlayer,
  RelistenErrorEvent,
  RelistenPlaybackErrorToName,
  RelistenPlaybackState,
  RelistenRemoteControlEvent,
  RelistenTrackStreamingCacheCompleteEvent,
} from '@/modules/relisten-audio-player';
import {
  activeTrackDownloadProgress,
  latestError,
  PlaybackContextProgress,
  progress as sharedStateProgress,
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
import { sharedStatsigClient, trackPlaybackErrorEvent } from '@/relisten/events';

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

  private currentlyProcessingPlayRequest: Promise<void> | undefined = undefined;
  private nextPlayRequest: { index: number; seekToTime?: number } | undefined = undefined;

  private maybeStartNextPlayRequest() {
    this.currentlyProcessingPlayRequest = undefined;

    if (!this.nextPlayRequest) {
      return false;
    }

    const playRequest = this.nextPlayRequest;
    this.nextPlayRequest = undefined;
    this.playTrackAtIndex(playRequest.index, playRequest.seekToTime);

    return true;
  }

  playTrackAtIndex(index: number, seekToTime?: number) {
    this.playbackIntentStarted = true;

    const newIndex = Math.max(0, Math.min(index, this.queue.orderedTracks.length - 1));

    const track = this.queue.orderedTracks[newIndex];
    if (
      track.identifier === this.queue.currentTrack?.identifier &&
      this.initialPlaybackStarted &&
      this.state == RelistenPlaybackState.Playing
    ) {
      logger.debug('Requested track matches current track, seeking back to the start');
      this.currentlyProcessingPlayRequest = this.seekTo(0.0).then(() => {
        this.maybeStartNextPlayRequest();
      });
      return;
    }

    // optimistically update the UI. should be before the native call to prevent race conditions
    this.optimisticallyUpdateCurrentTrack(track, seekToTime);

    if (this.currentlyProcessingPlayRequest) {
      this.nextPlayRequest = { index, seekToTime };
      logger.debug('playTrackAtIndex requested but currentlyProcessingPlayRequest');
      return;
    }

    let pausePromise = Promise.resolve();

    // stop any playing sound while the next http request is buffering
    if (this.state !== RelistenPlaybackState.Stopped) {
      this._state = RelistenPlaybackState.Paused;
      pausePromise = nativePlayer.pause();
      this.currentlyProcessingPlayRequest = pausePromise;
    }
    this.startStalledTimer();

    this.currentlyProcessingPlayRequest = pausePromise
      .then(() => {
        if (this.nextPlayRequest) {
          this.maybeStartNextPlayRequest();

          // if another request came in, don't try to play this original one
          return Promise.resolve();
        }

        return nativePlayer.play(
          track.toStreamable(this.enableStreamingCache),
          seekToTime !== undefined ? seekToTime * 1000.0 : undefined
        );
      })
      .then(() => {
        this.maybeStartNextPlayRequest();
      });

    if (seekToTime !== undefined) {
      this.updateSavedStateOnNextProgress = true;
    }

    // no need to recalculateNextTrack because currentTrackIdentifier.setState listeners will handle that
  }

  async stop() {
    this.addPlayerListeners();

    state.setState(RelistenPlaybackState.Stopped);
    await nativePlayer.stop();
  }

  next() {
    this.addPlayerListeners();

    const currentIdx = this.queue.currentIndex;

    if (
      currentIdx === undefined ||
      currentIdx + this.queue.prevNextTrackIndexIntentOffset >= this.queue.orderedTracks.length - 1
    ) {
      return;
    }

    this.playbackIntentStarted = true;
    this.startStalledTimer();

    this.queue.prevNextTrackIndexIntentOffset += 1;
    this.playTrackAtIndex(currentIdx + this.queue.prevNextTrackIndexIntentOffset);
  }

  previous() {
    this.addPlayerListeners();

    const currentIdx = this.queue.currentIndex;

    if (currentIdx === undefined || currentIdx - this.queue.prevNextTrackIndexIntentOffset < 0) {
      return;
    }

    this.playbackIntentStarted = true;
    this.startStalledTimer();

    this.queue.prevNextTrackIndexIntentOffset -= 1;
    this.playTrackAtIndex(currentIdx + this.queue.prevNextTrackIndexIntentOffset);
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

    const currentTrack = this.queue.currentTrack;

    if (currentTrack) {
      const duration = currentTrack.sourceTrack.duration ?? 100;

      // optimistically update the UI
      sharedStateProgress.setState({
        elapsed: pct * duration,
        duration,
        percent: pct,
      });
    }

    this.startStalledTimer();

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

  private optimisticallyUpdateCurrentTrack(track: PlayerQueueTrack, seekToTime?: number) {
    // Do NOT use onCurrentTrackIdentifierChanged because that will also recalculate the next track
    this.queue.onCurrentTrackChanged.dispatch(track);

    const elapsed = seekToTime ?? 0;
    const duration = track.sourceTrack.duration ?? 100;

    sharedStateProgress.setState({
      elapsed,
      duration,
      percent: elapsed / duration,
    });

    activeTrackDownloadProgress.setState({
      downloadedBytes: 0,
      totalBytes: 1,
      percent: 0.0,
    });
  }

  private startStalledTimer() {
    logger.debug('starting stall timer');

    this._stalledTimer = setTimeout(() => {
      if (this.state != RelistenPlaybackState.Playing) {
        logger.debug(
          `hit stalledTimer, setting state to stalled because current state is ${this.state}`
        );
        state.setState(RelistenPlaybackState.Stalled);
      } else {
        logger.debug(`hit stalledTimer, but state is ${this.state}`);
      }
    }, 250) as unknown as number;
  }

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
    if (this._stalledTimer !== undefined) {
      // if we are waiting on a stall we've created an intent to play something
      return;
    }

    if (
      this.progress &&
      // 40% through aligns with Last.FM
      this.progress.percent <= 0.4 &&
      progress.percent > 0.4 &&
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
    if (this._stalledTimer !== undefined && newState === RelistenPlaybackState.Playing) {
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
    } else if (event.method === 'nextTrack') {
      this.next();
    }
  };

  private onTrackStreamingCacheComplete = (event: RelistenTrackStreamingCacheCompleteEvent) => {
    if (!this.enableStreamingCache) {
      return;
    }

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
    logger.warn('Native playback error', error);

    sharedStatsigClient().logEvent(trackPlaybackErrorEvent(this.queue.currentTrack?.sourceTrack));

    showMessage({
      message: 'Error: ' + (error.errorMessage ?? RelistenPlaybackErrorToName[error.error]),
      description: error.errorDescription,
      type: 'danger',
      duration: 10_000,
    });
  };
  // endregion
}
