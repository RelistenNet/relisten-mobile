import {
  nativePlayer,
  RelistenErrorEvent,
  RelistenPlaybackState,
  RelistenPlaybackSnapshot,
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

enum NativePlayRequestPhase {
  WaitingToIssue,
  Issued,
  AwaitingConfirmation,
}

interface NativePlayRequest {
  identifier: string;
  version: number;
  phase: NativePlayRequestPhase;
  failed: boolean;
}

interface QueuedPlayRequest {
  identifier: string;
  seekToTime?: number;
}

export interface RelistenPlayerReportTrackEvent {
  playbackStartedAt: Date;
  playerQueueTrack: PlayerQueueTrack;
}

// Coordinates queue selection and native playback requests. Track and timing events
// are checked against the active request before they reach shared UI state.
export class RelistenPlayer {
  static DEFAULT_INSTANCE = new RelistenPlayer();

  dispose() {
    this.queue.flushPlayerState();
    this.removePlayerListeners();
  }

  private _queue: RelistenPlayerQueue = new RelistenPlayerQueue(this);

  private _state: RelistenPlaybackState = RelistenPlaybackState.Stopped;
  private _stalledTimer: number | undefined = undefined;

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

  get canRestorePlayerState() {
    const state = this.state;
    return (
      this._queue.orderedTracks.length === 0 &&
      !this.playbackIntentStarted &&
      !this.initialPlaybackStarted &&
      (state === RelistenPlaybackState.Stopped || state === RelistenPlaybackState.Paused)
    );
  }

  prepareForPlayerStateRestore() {
    if (this.canRestorePlayerState && this._state === RelistenPlaybackState.Paused) {
      // An empty native player can announce Paused before JS restores its queue.
      // The restored position must start a stream, rather than resume a nonexistent one.
      state.setState(RelistenPlaybackState.Stopped);
    }
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
    this.queue.flushPlayerState();
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
      const index = this.queue.currentIndex ?? 0;
      const track = this.queue.orderedTracks[index];
      if (track) {
        const seekToTime = this.checkpointProgress(track.identifier)?.elapsed;
        this.playTrackAtIndex(index, seekToTime);
      }

      return;
    }

    state.setState(RelistenPlaybackState.Playing);
    this.playbackDriver.resume().then(() => {});
  }

  pause() {
    this.addPlayerListeners();

    if (
      this.nativePlayRequest &&
      this.nativePlayRequest.phase !== NativePlayRequestPhase.WaitingToIssue
    ) {
      // An issued stream may still confirm; Pause cancels only the queued successor.
      this.nextPlayRequest = undefined;
      this.requestedTrackIdentifier = this.nativePlayRequest.identifier;
    } else {
      this.cancelPendingPlayRequests('pause');
    }
    this.clearStalledTimer();
    state.setState(RelistenPlaybackState.Paused);
    this.queue.flushPlayerState();
    this.playbackDriver.pause().then(() => this.queue.flushPlayerState());
  }

  private currentlyProcessingPlayRequest: Promise<void> | undefined = undefined;
  private nextPlayRequest?: QueuedPlayRequest;
  private playRequestVersion = 0;
  private nativePlayRequest?: NativePlayRequest;
  private requestedTrackIdentifier?: string;

  private get requestedTrackIndex(): number | undefined {
    const index = this._queue.orderedTracks.findIndex(
      (track) => track.identifier === this.requestedTrackIdentifier
    );
    return index >= 0 ? index : undefined;
  }

  public cancelPendingPlayRequests(reason: string) {
    const currentTrack = this._queue.currentTrack;
    const hasUnconfirmedPreview =
      this.nativePlayRequest !== undefined &&
      this.nativePlayRequest.identifier !== currentTrack?.identifier;
    const confirmedProgress = this.progress;
    this.playRequestVersion += 1;
    this.currentlyProcessingPlayRequest = undefined;
    this.nativePlayRequest = undefined;
    this.nextPlayRequest = undefined;
    this.requestedTrackIdentifier = undefined;

    if (hasUnconfirmedPreview) {
      // Restore the UI without publishing native identity or preparing another stream.
      this._queue.onCurrentTrackChanged.dispatch(currentTrack);
      if (confirmedProgress) {
        sharedStateProgress.setState(confirmedProgress);
      }
    }
    logger.debug('cancelPendingPlayRequests', {
      reason,
      playRequestVersion: this.playRequestVersion,
    });
  }

  private maybeStartNextPlayRequest() {
    this.currentlyProcessingPlayRequest = undefined;
    this.nativePlayRequest = undefined;

    if (!this.nextPlayRequest) {
      this.requestedTrackIdentifier = undefined;
      return false;
    }

    const playRequest = this.nextPlayRequest;
    this.nextPlayRequest = undefined;
    const index = this._queue.orderedTracks.findIndex(
      (track) => track.identifier === playRequest.identifier
    );
    if (index < 0) {
      this.requestedTrackIdentifier = undefined;
      return false;
    }
    logger.debug('starting deferred play request', {
      identifier: playRequest.identifier,
      index,
      seekToTime: playRequest.seekToTime,
      playRequestVersion: this.playRequestVersion,
    });
    this.playTrackAtIndex(index, playRequest.seekToTime);

    return true;
  }

  /** A completion may release only the processing slot that it originally owned. */
  private finishPlayRequest(request: Promise<void>) {
    if (this.currentlyProcessingPlayRequest !== request) {
      return;
    }
    if (this.nativePlayRequest?.failed && !this.nextPlayRequest) {
      this.cancelPendingPlayRequests('failedPlay');
    } else {
      this.maybeStartNextPlayRequest();
    }
  }

  /** Stop before an edit removes a selected or requested occurrence. */
  onQueueTrackRemoving(identifier: string): boolean {
    const affected =
      identifier === this._queue.currentTrack?.identifier ||
      identifier === this.nativePlayRequest?.identifier ||
      identifier === this.nextPlayRequest?.identifier;
    if (affected) {
      void this.stop();
    }
    return affected;
  }

  playTrackAtIndex(index: number, seekToTime?: number) {
    this.playbackIntentStarted = true;

    const newIndex = Math.max(0, Math.min(index, this.queue.orderedTracks.length - 1));
    const playRequestVersion = ++this.playRequestVersion;
    const track = this.queue.orderedTracks[newIndex];
    this.requestedTrackIdentifier = track.identifier;
    logger.debug('playTrackAtIndex requested', {
      index,
      newIndex,
      identifier: track?.identifier,
      seekToTime,
      currentlyProcessingPlayRequest: !!this.currentlyProcessingPlayRequest,
      playRequestVersion,
      requestedTrackIndex: this.requestedTrackIndex,
    });

    if (this.currentlyProcessingPlayRequest) {
      this.nextPlayRequest = { identifier: track.identifier, seekToTime };
      logger.debug('Queued play request behind current transition', {
        index: newIndex,
        seekToTime,
        identifier: track.identifier,
        playRequestVersion,
      });
      return;
    }

    if (
      track.identifier === this.queue.currentTrack?.identifier &&
      this.initialPlaybackStarted &&
      this.state == RelistenPlaybackState.Playing
    ) {
      logger.debug('Requested track matches current track, seeking within the current item');
      const seek = seekToTime === undefined ? this.seekTo(0) : this.seekToTime(seekToTime);
      const request: Promise<void> = seek
        .then(() => this.finishPlayRequest(request))
        .catch((error) => {
          this.finishPlayRequest(request);
          throw error;
        });
      this.currentlyProcessingPlayRequest = request;
      return;
    }

    // Record the target before publishing its timing, so late events from the previous track are rejected.
    this.nativePlayRequest = {
      identifier: track.identifier,
      version: playRequestVersion,
      phase: NativePlayRequestPhase.WaitingToIssue,
      failed: false,
    };
    this.optimisticallyUpdateCurrentTrack(track, seekToTime);

    let pausePromise = Promise.resolve();

    // stop any playing sound while the next http request is buffering
    if (this.state !== RelistenPlaybackState.Stopped) {
      pausePromise = this.playbackDriver.pause();
    }
    this.startStalledTimer();

    const request: Promise<void> = pausePromise
      .then(() => {
        if (this.currentlyProcessingPlayRequest !== request) {
          return;
        }
        if (playRequestVersion !== this.playRequestVersion || this.nextPlayRequest) {
          this.finishPlayRequest(request);
          return;
        }

        // Queue edits can move this occurrence while native pause is pending.
        const orderedTracks = this._queue.orderedTracks;
        const startIndex = orderedTracks.findIndex(
          (entry) => entry.identifier === track.identifier
        );
        if (startIndex < 0) {
          this.finishPlayRequest(request);
          return;
        }
        const queueContext: PlaybackQueueContext = {
          orderedTracks,
          startIndex,
          startTimeMs: seekToTime !== undefined ? seekToTime * 1000.0 : undefined,
          repeatState: this.queue.repeatState,
          shuffleState: this.queue.shuffleState,
          autoplay: true,
        };
        logger.debug('Issuing native play request', {
          identifier: track.identifier,
          playRequestVersion,
          queueLength: queueContext.orderedTracks.length,
          startIndex: queueContext.startIndex,
        });
        this.nativePlayRequest = {
          identifier: track.identifier,
          version: playRequestVersion,
          phase: NativePlayRequestPhase.Issued,
          failed: false,
        };
        // Even a stopped selection needs a new confirmation to prepare its successor.
        currentTrackIdentifier.setState(undefined);
        return this.playbackDriver.play(
          track.toStreamable(this.enableStreamingCache),
          queueContext
        );
      })
      .then(() => {
        if (
          this.currentlyProcessingPlayRequest === request &&
          this.nativePlayRequest?.version === playRequestVersion
        ) {
          this.nativePlayRequest.phase = NativePlayRequestPhase.AwaitingConfirmation;
          if (
            this.nativePlayRequest.failed ||
            this.nativePlayRequest.identifier === currentTrackIdentifier.lastState()
          ) {
            this.finishPlayRequest(request);
          }
        }
      })
      .catch((error) => {
        this.finishPlayRequest(request);
        throw error;
      });
    this.currentlyProcessingPlayRequest = request;

    // no need to recalculateNextTrack because currentTrackIdentifier.setState listeners will handle that
  }

  async stop() {
    this.addPlayerListeners();
    this.queue.flushPlayerState();
    this.cancelPendingPlayRequests('stop');
    this._queue.forgetPreparedNextTrack();
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

  /** Seek to a fraction (0-1), preserving pause and retaining a stopped track's position. */
  seekTo(pct: number): Promise<void> {
    this.addPlayerListeners();
    const duration = this.seekDuration;
    const percent = Math.max(0, Math.min(1, pct));
    return this.prepareSeek(percent * duration, duration)
      ? this.playbackDriver.seekTo(percent)
      : Promise.resolve();
  }

  /** Seek in seconds without resuming. The next Play uses a stopped track's selected position. */
  seekToTime(time: number): Promise<void> {
    this.addPlayerListeners();
    // Restore and Cast handoff can supply a position before native duration is known.
    const elapsed = Math.max(0, time);
    return this.prepareSeek(elapsed, this.seekDuration)
      ? this.playbackDriver.seekToTime(elapsed * 1000.0)
      : Promise.resolve();
  }

  private get seekDuration() {
    return (
      sharedStateProgress.lastState()?.duration ??
      this.queue.currentTrack?.sourceTrack.duration ??
      100
    );
  }

  /** Publish the seek and report whether the active driver can apply it now. */
  private prepareSeek(elapsed: number, duration: number): boolean {
    const progress = { elapsed, duration, percent: duration > 0 ? elapsed / duration : 0 };
    const pendingIdentifier = this.nativePlayRequest?.identifier;
    if (pendingIdentifier !== undefined) {
      const pendingIndex = this.queue.orderedTracks.findIndex(
        (track) => track.identifier === pendingIdentifier
      );
      const hasNewerSelection =
        this.nextPlayRequest !== undefined && this.nextPlayRequest.identifier !== pendingIdentifier;
      if (pendingIndex < 0 || hasNewerSelection) {
        return false;
      }

      // The pending pause/play can overwrite a direct seek, even after track confirmation.
      // Let the command owner finish before applying the latest position to its target.
      sharedStateProgress.setState(progress);
      this.playTrackAtIndex(pendingIndex, elapsed);
      return false;
    }

    sharedStateProgress.setState(progress);
    // An explicit seek is a checkpoint even when native progress is suppressed while buffering.
    this.progress = progress;
    this.queue.savePlayerState(true);

    if (shouldStartStalledTimerForSeek(this.state)) {
      this.startStalledTimer();
    }
    return this.state !== RelistenPlaybackState.Stopped;
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
  private nativeSnapshotListener?: ReturnType<typeof nativePlayer.addPlaybackSnapshotListener>;
  private nativeSessionId?: string;
  private retiredNativeSessions = new Set<string>();
  private nativeSequence = -1;
  private confirmedTrackIdentifier?: string;
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
    // This listener publishes state, selection and timing from the same native observation.
    this.nativeSnapshotListener = nativePlayer.addPlaybackSnapshotListener(this.onNativeSnapshot);

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
    this.nativeSnapshotListener?.remove();

    this.addedPlayerListeners = false;
  }

  private onProgress = (progress: PlaybackContextProgress) => {
    // Keep the confirmed timing while buffering or displaying an unconfirmed request.
    if (
      this._stalledTimer !== undefined ||
      (this.nativePlayRequest !== undefined &&
        this.nativePlayRequest.identifier !== this._queue.currentTrack?.identifier)
    ) {
      return;
    }

    this.updateConfirmedProgress(progress);
  };

  private updateConfirmedProgress(progress: PlaybackContextProgress) {
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

    this.queue.savePlayerState();
  }

  private onQueueTrackChanged = (track?: PlayerQueueTrack) => {
    // The UI can announce a requested track before native playback selects it.
    if (!track || track.identifier !== this._queue.currentTrack?.identifier) {
      return;
    }

    if (track.identifier === this.nativePlayRequest?.identifier) {
      // The queue confirmed the request, so the timing shown in the UI can now be saved.
      this.progress = sharedStateProgress.lastState();
    } else if (track.identifier !== this.confirmedTrackIdentifier) {
      // An automatic track change starts at zero. Duplicate notifications keep existing timing.
      const catalogDuration = track.sourceTrack.duration;
      this.progress = {
        elapsed: 0,
        duration: catalogDuration != null && catalogDuration > 0 ? catalogDuration : 100,
        percent: 0,
      };
      sharedStateProgress.setState(this.progress);
    }
    this.confirmedTrackIdentifier = track.identifier;
  };

  /** Only confirmed identity can supply timing to a persisted queue selection. */
  checkpointProgress(identifier: string) {
    return identifier === this.confirmedTrackIdentifier ? this.progress : undefined;
  }

  private onNativeSnapshot = (snapshot: RelistenPlaybackSnapshot) => {
    if (playbackSource.lastState() === PlaybackSource.Cast) {
      return;
    }

    const track = this._queue.orderedTracks.find(
      (entry) =>
        entry.identifier === snapshot.identifier &&
        entry.sourceTrack.uuid === snapshot.sourceTrackUuid
    );
    if (snapshot.identifier && !track) {
      return; // The queue was edited or replaced before this observation arrived.
    }
    if (!this.acceptNativeSession(snapshot)) {
      return;
    }

    if (track) {
      this.applyNativeTrackSnapshot(snapshot, track);
    } else {
      // An empty native player retains the selected queue entry for the next Play.
      this.nativeSequence = snapshot.sequence;
      this._queue.forgetPreparedNextTrack();
      this.publishNativeState(snapshot.playbackState);
      this._queue.flushPlayerState();
    }
  };

  /**
   * A replacement backend must match the pending target, including no selection when idle.
   * Applying the observation below advances the sequence; this check only adopts its session.
   */
  private acceptNativeSession(snapshot: RelistenPlaybackSnapshot): boolean {
    const validSequence = Number.isSafeInteger(snapshot.sequence) && snapshot.sequence >= 0;
    if (
      !snapshot.sessionId ||
      !validSequence ||
      this.retiredNativeSessions.has(snapshot.sessionId)
    ) {
      return false;
    }

    if (snapshot.sessionId !== this.nativeSessionId) {
      const startsRequestedTrack = snapshot.identifier === this.nativePlayRequest?.identifier;
      if (this.nativeSessionId && !startsRequestedTrack) {
        return false;
      }
      if (this.nativeSessionId) {
        this.retiredNativeSessions.add(this.nativeSessionId);
      }
      this.nativeSessionId = snapshot.sessionId;
      this.nativeSequence = -1;
    }

    return snapshot.sequence > this.nativeSequence;
  }

  private applyNativeTrackSnapshot(snapshot: RelistenPlaybackSnapshot, track: PlayerQueueTrack) {
    const selectionChanged = track.identifier !== this._queue.currentTrack?.identifier;
    const request = this.nativePlayRequest;
    const unexpectedTrack =
      selectionChanged && request !== undefined && track.identifier !== request.identifier;

    // Auto-advance during pause must not complete a Play that has not been issued yet.
    if (unexpectedTrack && request.phase === NativePlayRequestPhase.WaitingToIssue) {
      return;
    }
    if (unexpectedTrack) {
      this.nativePlayRequest = undefined;
      this.requestedTrackIdentifier = undefined;
    }

    const saveImmediately =
      selectionChanged ||
      snapshot.checkpoint ||
      snapshot.playbackState === RelistenPlaybackState.Paused ||
      snapshot.playbackState === RelistenPlaybackState.Stopped;

    this._queue.applyPlaybackCheckpoint(() => {
      this.nativeSequence = snapshot.sequence;
      this.confirmNativeTrack(track);
      const progress = this.progressFromNativeSnapshot(snapshot, track, selectionChanged);
      this.applyNativePlayback(snapshot, progress, saveImmediately);
    }, saveImmediately);

    if (unexpectedTrack) {
      this.maybeStartNextPlayRequest();
    }
  }

  private confirmNativeTrack(track: PlayerQueueTrack) {
    // Restore selects an entry before native playback confirms it. Publication also
    // prepares the next stream and completes an issued Play request through listeners.
    if (currentTrackIdentifier.lastState() !== track.identifier) {
      currentTrackIdentifier.setState(track.identifier);
    }
    this.confirmedTrackIdentifier = track.identifier;
  }

  private progressFromNativeSnapshot(
    snapshot: RelistenPlaybackSnapshot,
    track: PlayerQueueTrack,
    selectionChanged: boolean
  ): PlaybackContextProgress {
    const previous = selectionChanged ? undefined : this.progress;
    let duration = previous?.duration ?? (track.sourceTrack.duration || 100);
    let elapsed = previous?.elapsed ?? 0;

    if (
      snapshot.duration !== undefined &&
      Number.isFinite(snapshot.duration) &&
      snapshot.duration > 0
    ) {
      duration = snapshot.duration;
    }
    if (snapshot.elapsed !== undefined && Number.isFinite(snapshot.elapsed)) {
      elapsed = snapshot.elapsed;
    }
    elapsed = Math.max(0, elapsed);

    return { elapsed, duration, percent: duration > 0 ? elapsed / duration : 0 };
  }

  private applyNativePlayback(
    snapshot: RelistenPlaybackSnapshot,
    progress: PlaybackContextProgress,
    saveImmediately: boolean
  ) {
    const request = this.nativePlayRequest;
    const previewingAnotherTrack =
      request !== undefined && request.identifier !== snapshot.identifier;
    const published = sharedStateProgress.lastState();
    const elapsedSecondChanged =
      !published || Math.floor(published.elapsed) !== Math.floor(progress.elapsed);
    const durationChanged = published?.duration !== progress.duration;
    const playbackStateChanged = snapshot.playbackState !== this._state;

    // Saves and listening history use every sample, even when a pending request owns the UI preview.
    this.updateConfirmedProgress(progress);
    if (previewingAnotherTrack) {
      return;
    }

    if (saveImmediately || elapsedSecondChanged || durationChanged || playbackStateChanged) {
      sharedStateProgress.setState(progress);
    }
    this.publishNativeState(snapshot.playbackState);
  }

  private publishNativeState(playbackState: RelistenPlaybackState) {
    // Native completion ends buffering even when SharedState deduplicates the state value.
    if (playbackState !== RelistenPlaybackState.Stalled) {
      this.clearStalledTimer();
    }
    state.setState(playbackState);
  }

  private onNativePlayerStateChanged = (newState: RelistenPlaybackState) => {
    logger.debug('onNativePlayerStateChanged', newState);

    // Clear the default stalled UI fallback
    if (newState === RelistenPlaybackState.Playing) {
      this.clearStalledTimer();
    }

    if (!this.initialPlaybackStarted && newState == RelistenPlaybackState.Playing) {
      this.initialPlaybackStarted = true;
    }

    if (newState === RelistenPlaybackState.Paused || newState === RelistenPlaybackState.Stopped) {
      this.queue.flushPlayerState();
    }

    if (this._state != newState) {
      this._state = newState;
      this.onStateChanged.dispatch(newState);
    }
  };

  private onCurrentTrackIdentifierChanged = (newIdentifier?: string) => {
    if (
      !newIdentifier ||
      !this.nativePlayRequest ||
      this.nativePlayRequest.phase === NativePlayRequestPhase.WaitingToIssue ||
      newIdentifier !== this.nativePlayRequest.identifier
    ) {
      return;
    }

    logger.debug('native track change completed active play request', {
      newIdentifier,
      activeNativePlayRequestVersion: this.nativePlayRequest.version,
      playRequestVersion: this.playRequestVersion,
    });

    // A snapshot publishes identity before its timing. Finish after that observation so a
    // queued seek cannot be overwritten by the confirming snapshot's earlier position.
    const request = this.currentlyProcessingPlayRequest;
    if (request) {
      void Promise.resolve().then(() => this.finishPlayRequest(request));
    }
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

    const request = this.currentlyProcessingPlayRequest;
    if (
      request &&
      this.nativePlayRequest &&
      this.nativePlayRequest.phase !== NativePlayRequestPhase.WaitingToIssue &&
      this.nativePlayRequest.identifier === error.identifier
    ) {
      // Occurrence IDs survive Stop/Resume. An error alone cannot acknowledge
      // a new command for the same occurrence; wait for that command's result.
      this.nativePlayRequest.failed = true;
      if (this.nativePlayRequest.phase === NativePlayRequestPhase.AwaitingConfirmation) {
        this.finishPlayRequest(request);
      }
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
