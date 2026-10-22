import {
  nativePlayer,
  RelistenErrorEvent,
  RelistenPlaybackState,
  RelistenPlaybackProgressChangedEvent,
  RelistenTrackChangedEvent,
  RelistenRemoteControlEvent,
  RelistenTrackStreamingCacheCompleteEvent,
} from '@/modules/relisten-audio-player';
import {
  activeTrackDownloadProgress,
  currentTrackIdentifier,
  latestError,
  PlaybackContextProgress,
  PlaybackSource,
  playbackSource,
  progress as sharedStateProgress,
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
import {
  NativePlaybackDriver,
  PlaybackDriver,
  PlaybackQueueContext,
} from '@/relisten/player/playback_driver';
import { shouldStartStalledTimerForSeek } from '@/relisten/player/seek_stall_policy';

const logger = log.extend('player');

export interface RelistenPlayerReportTrackEvent {
  playbackStartedAt: Date;
  playerQueueTrack: PlayerQueueTrack;
}

// Coordinates queue selection and native playback requests. Track and timing events
// are checked against the active request before they reach shared UI state.
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

  private nativeDriver = new NativePlaybackDriver();
  private playbackDriver: PlaybackDriver = this.nativeDriver;

  /** Timing for the confirmed queue track. Shared UI progress can preview a requested track. */
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

  setPlaybackDriver(driver: PlaybackDriver) {
    if (this.playbackDriver === driver) {
      return;
    }

    logger.debug(`Switching playback driver to ${driver.name}`);
    this.playbackDriver = driver;
  }

  getNativePlaybackDriver() {
    return this.nativeDriver;
  }

  setNextStream(streamable?: ReturnType<PlayerQueueTrack['toStreamable']>) {
    this.playbackDriver.setNextStream(streamable);
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
    this.playbackDriver.resume().then(() => {});
  }

  pause() {
    this.addPlayerListeners();

    this.clearStalledTimer();
    state.setState(RelistenPlaybackState.Paused);
    this.playbackDriver.pause().then(() => {});
  }

  private currentlyProcessingPlayRequest: Promise<void> | undefined = undefined;
  private nextPlayRequest: { index: number; seekToTime?: number } | undefined = undefined;
  private playRequestVersion = 0;
  private activeNativePlayRequestVersion: number | undefined = undefined;
  private activeNativePlayRequestIdentifier: string | undefined = undefined;
  private requestedTrackIndex: number | undefined = undefined;

  public cancelPendingPlayRequests(reason: string) {
    this.playRequestVersion += 1;
    this.currentlyProcessingPlayRequest = undefined;
    this.activeNativePlayRequestVersion = undefined;
    this.activeNativePlayRequestIdentifier = undefined;
    this.nextPlayRequest = undefined;
    this.requestedTrackIndex = undefined;

    logger.debug('cancelPendingPlayRequests', {
      reason,
      playRequestVersion: this.playRequestVersion,
    });
  }

  private maybeStartNextPlayRequest() {
    this.currentlyProcessingPlayRequest = undefined;
    this.activeNativePlayRequestVersion = undefined;
    this.activeNativePlayRequestIdentifier = undefined;

    if (!this.nextPlayRequest) {
      this.requestedTrackIndex = undefined;
      return false;
    }

    const playRequest = this.nextPlayRequest;
    this.nextPlayRequest = undefined;
    logger.debug('starting deferred play request', {
      index: playRequest.index,
      seekToTime: playRequest.seekToTime,
      playRequestVersion: this.playRequestVersion,
    });
    this.playTrackAtIndex(playRequest.index, playRequest.seekToTime);

    return true;
  }

  playTrackAtIndex(index: number, seekToTime?: number) {
    this.playbackIntentStarted = true;
    this.autoAdvanceProgressGuard = undefined;

    const newIndex = Math.max(0, Math.min(index, this.queue.orderedTracks.length - 1));
    const playRequestVersion = ++this.playRequestVersion;
    this.requestedTrackIndex = newIndex;

    const track = this.queue.orderedTracks[newIndex];
    logger.debug('playTrackAtIndex requested', {
      index,
      newIndex,
      identifier: track?.identifier,
      seekToTime,
      currentlyProcessingPlayRequest: !!this.currentlyProcessingPlayRequest,
      playRequestVersion,
      requestedTrackIndex: this.requestedTrackIndex,
    });

    if (
      track.identifier === this.queue.currentTrack?.identifier &&
      this.initialPlaybackStarted &&
      this.state == RelistenPlaybackState.Playing
    ) {
      logger.debug('Requested track matches current track, seeking back to the start');
      this.currentlyProcessingPlayRequest = this.seekTo(0.0).then(() => {
        if (playRequestVersion !== this.playRequestVersion) {
          logger.debug('Skipping stale same-track seek request', {
            requestedVersion: playRequestVersion,
            currentVersion: this.playRequestVersion,
            identifier: track.identifier,
          });
          this.maybeStartNextPlayRequest();
          return;
        }

        this.maybeStartNextPlayRequest();
      });
      return;
    }

    if (this.currentlyProcessingPlayRequest) {
      this.nextPlayRequest = { index: newIndex, seekToTime };
      logger.debug('Queued play request behind current transition', {
        index: newIndex,
        seekToTime,
        identifier: track.identifier,
        playRequestVersion,
      });
      return;
    }

    // Record the target before publishing its timing, so late events from the previous track are rejected.
    this.activeNativePlayRequestIdentifier = track.identifier;
    this.optimisticallyUpdateCurrentTrack(track, seekToTime);

    let pausePromise = Promise.resolve();

    // stop any playing sound while the next http request is buffering
    if (this.state !== RelistenPlaybackState.Stopped) {
      this._state = RelistenPlaybackState.Paused;
      pausePromise = this.playbackDriver.pause();
      this.currentlyProcessingPlayRequest = pausePromise;
    }
    this.startStalledTimer();

    const queueContext: PlaybackQueueContext = {
      orderedTracks: this.queue.orderedTracks,
      startIndex: newIndex,
      startTimeMs: seekToTime !== undefined ? seekToTime * 1000.0 : undefined,
      repeatState: this.queue.repeatState,
      shuffleState: this.queue.shuffleState,
      autoplay: true,
    };

    this.currentlyProcessingPlayRequest = pausePromise
      .then(() => {
        if (playRequestVersion !== this.playRequestVersion) {
          logger.debug('Skipping stale play request before native play', {
            requestedVersion: playRequestVersion,
            currentVersion: this.playRequestVersion,
            identifier: track.identifier,
          });
          this.maybeStartNextPlayRequest();
          return Promise.resolve();
        }

        if (this.nextPlayRequest) {
          logger.debug('Skipping native play because a newer request is queued', {
            identifier: track.identifier,
            playRequestVersion,
          });
          this.maybeStartNextPlayRequest();

          // if another request came in, don't try to play this original one
          return Promise.resolve();
        }

        logger.debug('Issuing native play request', {
          identifier: track.identifier,
          playRequestVersion,
          queueLength: queueContext.orderedTracks.length,
          startIndex: queueContext.startIndex,
        });
        // An automatic track change during pause must not complete a request we have not issued.
        this.activeNativePlayRequestVersion = playRequestVersion;
        return this.playbackDriver.play(
          track.toStreamable(this.enableStreamingCache),
          queueContext
        );
      })
      .then(() => {
        if (this.activeNativePlayRequestVersion !== playRequestVersion) {
          return;
        }

        if (this.activeNativePlayRequestIdentifier === currentTrackIdentifier.lastState()) {
          logger.debug('native play request resolved without track identifier change', {
            identifier: this.activeNativePlayRequestIdentifier,
            playRequestVersion,
          });
          this.maybeStartNextPlayRequest();
        }
      })
      .catch((error) => {
        if (this.activeNativePlayRequestVersion === playRequestVersion) {
          this.activeNativePlayRequestVersion = undefined;
          this.activeNativePlayRequestIdentifier = undefined;
        }

        if (this.currentlyProcessingPlayRequest) {
          this.maybeStartNextPlayRequest();
        }

        throw error;
      });

    if (seekToTime !== undefined) {
      this.updateSavedStateOnNextProgress = true;
    }

    // no need to recalculateNextTrack because currentTrackIdentifier.setState listeners will handle that
  }

  async stop() {
    this.addPlayerListeners();
    this.cancelPendingPlayRequests('stop');
    this.clearStalledTimer();

    state.setState(RelistenPlaybackState.Stopped);
    await this.playbackDriver.stop();
  }

  next() {
    this.addPlayerListeners();

    const baseIndex = this.requestedTrackIndex ?? this.queue.currentIndex;

    if (baseIndex === undefined) {
      return;
    }

    const targetIndex = Math.min(baseIndex + 1, this.queue.orderedTracks.length - 1);

    if (targetIndex === baseIndex) {
      logger.debug('next requested at queue end, ignoring', {
        baseIndex,
        currentIndex: this.queue.currentIndex,
        requestedTrackIndex: this.requestedTrackIndex,
      });
      return;
    }

    this.playbackIntentStarted = true;
    this.startStalledTimer();

    logger.debug('next requested', {
      baseIndex,
      targetIndex,
      currentIndex: this.queue.currentIndex,
      requestedTrackIndex: this.requestedTrackIndex,
    });

    this.playTrackAtIndex(targetIndex);
  }

  previous() {
    this.addPlayerListeners();

    const baseIndex = this.requestedTrackIndex ?? this.queue.currentIndex;

    if (baseIndex === undefined) {
      return;
    }

    const targetIndex = Math.max(baseIndex - 1, 0);

    if (targetIndex === baseIndex) {
      return;
    }

    this.playbackIntentStarted = true;
    this.startStalledTimer();

    logger.debug('previous requested', {
      baseIndex,
      targetIndex,
      currentIndex: this.queue.currentIndex,
      requestedTrackIndex: this.requestedTrackIndex,
    });

    this.playTrackAtIndex(targetIndex);
  }

  back() {
    this.addPlayerListeners();

    if (this.progress && (this.progress.elapsed > 5 || this.queue.currentIndex === 0)) {
      this.seekTo(0).then(() => {});
      return;
    }

    this.previous();
  }

  prepareAudioSession() {
    this.addPlayerListeners();

    nativePlayer.prepareAudioSession();
  }

  seekTo(pct: number): Promise<void> {
    this.addPlayerListeners();

    const playbackState = this.state;

    // We cannot seek if we aren't playing. Save this for when attempt to play.
    if (playbackState == RelistenPlaybackState.Stopped) {
      return Promise.resolve();
    }

    const currentTrack = this.queue.currentTrack;

    if (currentTrack) {
      const duration = this.progress?.duration ?? currentTrack.sourceTrack.duration ?? 100;

      // optimistically update the UI
      sharedStateProgress.setState({
        elapsed: pct * duration,
        duration,
        percent: pct,
      });
    }

    if (shouldStartStalledTimerForSeek(playbackState)) {
      this.startStalledTimer();
    }

    return this.playbackDriver.seekTo(pct);
  }

  seekToTime(time: number): Promise<void> {
    this.addPlayerListeners();

    // We cannot seek if we aren't playing. Save this for when attempt to play.
    if (this.state == RelistenPlaybackState.Stopped) {
      this.seekIntent = time;
      return Promise.resolve();
    }

    return this.playbackDriver.seekToTime(time * 1000.0);
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
    const elapsed = seekToTime ?? 0;
    const catalogDuration = track.sourceTrack.duration;
    const duration =
      (track.identifier === this.queue.currentTrack?.identifier
        ? this.progress?.duration
        : undefined) ?? (catalogDuration != null && catalogDuration > 0 ? catalogDuration : 100);

    sharedStateProgress.setState({
      elapsed,
      duration,
      percent: duration > 0 ? elapsed / duration : 0,
    });

    // Do NOT use onCurrentTrackIdentifierChanged because that will also recalculate the next track.
    this.queue.onCurrentTrackChanged.dispatch(track);

    activeTrackDownloadProgress.setState({
      downloadedBytes: 0,
      totalBytes: 1,
      percent: 0.0,
    });
  }

  private startStalledTimer() {
    logger.debug('starting stall timer');

    this.clearStalledTimer();

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

  private clearStalledTimer() {
    if (this._stalledTimer !== undefined) {
      clearTimeout(this._stalledTimer);
      this._stalledTimer = undefined;
    }
  }

  // region Player event handling
  private addedPlayerListeners = false;
  private nativeProgressListener?: ReturnType<typeof nativePlayer.addPlaybackProgressListener>;
  private nativeTrackListener?: ReturnType<typeof nativePlayer.addTrackChangedListener>;
  private confirmedTrackIdentifier?: string;
  private autoAdvanceProgressGuard:
    | { elapsed: number; duration: number; expiresAt: number }
    | undefined = undefined;

  /** Register once per player; dispose removes these listeners. */
  private addPlayerListeners() {
    if (this.addedPlayerListeners) {
      return;
    }

    addPlayerListeners();
    state.addListener(this.onNativePlayerStateChanged);
    latestError.addListener(this.onNativePlayerError);
    remoteControlEvent.addListener(this.onRemoteControlEvent);
    trackStreamingCacheComplete.addListener(this.onTrackStreamingCacheComplete);
    sharedStateProgress.addListener(this.onProgress);
    this._queue.onCurrentTrackChanged.addListener(this.onQueueTrackChanged);
    this._queue.addPlayerListeners();
    currentTrackIdentifier.addListener(this.onCurrentTrackIdentifierChanged);
    // UI hooks read shared state directly, so reject stale native events before publishing them.
    this.nativeProgressListener = nativePlayer.addPlaybackProgressListener(this.onNativeProgress);
    this.nativeTrackListener = nativePlayer.addTrackChangedListener(this.onNativeTrackChanged);

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
    sharedStateProgress.removeListener(this.onProgress);
    this._queue.onCurrentTrackChanged.removeListener(this.onQueueTrackChanged);
    currentTrackIdentifier.removeListener(this.onCurrentTrackIdentifierChanged);
    this._queue.removePlayerListeners();
    this.nativeProgressListener?.remove();
    this.nativeTrackListener?.remove();

    this.addedPlayerListeners = false;
  }

  private onProgress = (progress: PlaybackContextProgress) => {
    // Keep the confirmed timing while buffering or displaying an unconfirmed request.
    if (
      this._stalledTimer !== undefined ||
      (this.activeNativePlayRequestIdentifier !== undefined &&
        this.activeNativePlayRequestIdentifier !== this._queue.currentTrack?.identifier)
    ) {
      return;
    }

    if (this.progress && this.queue.currentTrack) {
      const wasEligible = this.progress.elapsed >= 240 || this.progress.percent >= 0.5;
      const nowEligible = progress.elapsed >= 240 || progress.percent >= 0.5;

      if (!wasEligible && nowEligible) {
        const currentTrack = this.queue.currentTrack;

        this.onShouldReportTrack.dispatch({
          playerQueueTrack: currentTrack,
          playbackStartedAt: this.queue.currentTrackPlaybackStartedAt || new Date(),
        });
      }
    }

    this.progress = progress;

    // save state based on playback every 5 seconds
    if (this.updateSavedStateOnNextProgress || Math.floor(progress.elapsed) % 5 === 0) {
      this.updateSavedStateOnNextProgress = false;
      this.queue.savePlayerState();
    }
  };

  private onQueueTrackChanged = (track?: PlayerQueueTrack) => {
    // The UI can announce a requested track before native playback selects it.
    if (!track || track.identifier !== this._queue.currentTrack?.identifier) {
      return;
    }

    if (track.identifier === this.activeNativePlayRequestIdentifier) {
      // The queue confirmed the request, so the timing shown in the UI can now be saved.
      this.autoAdvanceProgressGuard = undefined;
      this.progress = sharedStateProgress.lastState();
    } else if (track.identifier !== this.confirmedTrackIdentifier) {
      // An automatic track change starts at zero. Duplicate notifications keep existing timing.
      const previousProgress = this.progress;
      const catalogDuration = track.sourceTrack.duration;
      this.progress = {
        elapsed: 0,
        duration: catalogDuration != null && catalogDuration > 0 ? catalogDuration : 100,
        percent: 0,
      };
      sharedStateProgress.setState(this.progress);

      // Native progress events carry no track ID. Drop a final previous-track event that can
      // arrive just after the automatic transition, before accepting the new track's timing.
      this.autoAdvanceProgressGuard = previousProgress
        ? {
            elapsed: previousProgress.elapsed,
            duration: previousProgress.duration,
            expiresAt: Date.now() + 5000,
          }
        : undefined;
    }
    this.confirmedTrackIdentifier = track.identifier;
  };

  private onNativeProgress = (event: RelistenPlaybackProgressChangedEvent) => {
    // Progress events carry no track ID. During loading, wait for the requested track's ID.
    if (
      playbackSource.lastState() === PlaybackSource.Cast ||
      (this.activeNativePlayRequestIdentifier !== undefined &&
        this.activeNativePlayRequestIdentifier !== currentTrackIdentifier.lastState())
    ) {
      return;
    }

    const eventDuration = Number.isFinite(event.duration) ? (event.duration ?? 0) : undefined;
    const hasValidEventDuration = eventDuration !== undefined && eventDuration > 0;
    const autoAdvanceGuard = this.autoAdvanceProgressGuard;
    if (autoAdvanceGuard) {
      this.autoAdvanceProgressGuard = undefined;
      if (
        Date.now() <= autoAdvanceGuard.expiresAt &&
        Number.isFinite(event.elapsed) &&
        Math.abs((event.elapsed ?? 0) - autoAdvanceGuard.elapsed) < 5 &&
        (!hasValidEventDuration ||
          Math.abs((eventDuration as number) - autoAdvanceGuard.duration) < 5)
      ) {
        return;
      }
    }

    const lastProgress = sharedStateProgress.lastState();
    const elapsed = Number.isFinite(event.elapsed)
      ? (event.elapsed ?? 0)
      : (lastProgress?.elapsed ?? 0);
    // Transient nil/zero durations during transitions must not replace confirmed timing.
    const duration = hasValidEventDuration
      ? (eventDuration as number)
      : (lastProgress?.duration ?? 0);
    if (
      !lastProgress ||
      Math.floor(lastProgress.elapsed) !== Math.floor(elapsed) ||
      lastProgress.duration !== duration
    ) {
      sharedStateProgress.setState({
        elapsed,
        duration,
        percent: duration > 0 ? elapsed / duration : 0,
      });
    }
  };

  private onNativeTrackChanged = (event: RelistenTrackChangedEvent) => {
    if (
      playbackSource.lastState() === PlaybackSource.Cast ||
      (this.activeNativePlayRequestIdentifier !== undefined &&
        event.currentIdentifier !== this.activeNativePlayRequestIdentifier)
    ) {
      return;
    }
    currentTrackIdentifier.setState(event.currentIdentifier);
  };

  private onNativePlayerStateChanged = (newState: RelistenPlaybackState) => {
    logger.debug('onNativePlayerStateChanged', newState);

    // Clear the default stalled UI fallback
    if (newState === RelistenPlaybackState.Playing) {
      this.clearStalledTimer();
    }

    if (!this.initialPlaybackStarted && newState == RelistenPlaybackState.Playing) {
      this.initialPlaybackStarted = true;
    }

    if (this._state != newState) {
      this._state = newState;
      this.onStateChanged.dispatch(newState);
    }
  };

  private onCurrentTrackIdentifierChanged = (newIdentifier?: string) => {
    if (
      !newIdentifier ||
      this.activeNativePlayRequestVersion === undefined ||
      newIdentifier !== this.activeNativePlayRequestIdentifier
    ) {
      return;
    }

    logger.debug('native track change completed active play request', {
      newIdentifier,
      activeNativePlayRequestVersion: this.activeNativePlayRequestVersion,
      playRequestVersion: this.playRequestVersion,
    });

    this.maybeStartNextPlayRequest();
  };

  private onRemoteControlEvent = (event: RelistenRemoteControlEvent) => {
    logger.debug('onRemoteControlEvent', event.method);

    if (event.method === 'pause') {
      this.pause();
    } else if (event.method === 'resume' || event.method === 'play') {
      this.resume();
    } else if (event.method === 'prevTrack') {
      this.back();
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

    if (this.currentlyProcessingPlayRequest) {
      this.maybeStartNextPlayRequest();
    }

    sharedStatsigClient().logEvent(
      trackPlaybackErrorEvent(this.queue.currentTrack?.sourceTrack, error.error)
    );

    showMessage({
      message: 'Error: ' + error.error.message,
      description: error.error.description,
      type: 'danger',
      duration: 10_000,
    });
  };
  // endregion
}
