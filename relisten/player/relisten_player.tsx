import {
  nativePlayer,
  RelistenErrorEvent,
  RelistenPlaybackState,
} from '@/modules/relisten-audio-player';
import { latestError, state } from '@/relisten/player/shared_state';
import { addPlayerListeners } from '@/relisten/player/native_playback_state_hooks';
import { RelistenPlayerQueue } from '@/relisten/player/relisten_player_queue';
import { EventSource } from '@/relisten/util/event_source';

export class RelistenPlayer {
  static DEFAULT_INSTANCE = new RelistenPlayer();

  constructor() {}

  dispose() {
    this.removePlayerListeners();
  }

  private _queue: RelistenPlayerQueue = new RelistenPlayerQueue(this);

  private _state: RelistenPlaybackState = RelistenPlaybackState.Stopped;

  // region Public API
  onStateChanged = new EventSource<RelistenPlaybackState>();

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
        this.queue.playTrackAtIndex(0);
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

  stop() {
    this.addPlayerListeners();

    state.setState(RelistenPlaybackState.Stopped);
    nativePlayer.stop().then(() => {});
  }

  next() {
    this.addPlayerListeners();

    nativePlayer.next().then(() => {});
  }

  prepareAudioSession() {
    this.addPlayerListeners();

    nativePlayer.prepareAudioSession();
  }

  seekTo(pct: number): Promise<void> {
    this.addPlayerListeners();

    return nativePlayer.seekTo(pct);
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
    this._queue.addPlayerListeners();

    this.addedPlayerListeners = true;
  }

  private removePlayerListeners() {
    if (!this.addedPlayerListeners) {
      return;
    }

    state.removeListener(this.onNativePlayerStateChanged);
    latestError.removeListener(this.onNativePlayerError);
    this._queue.removePlayerListeners();

    this.addedPlayerListeners = false;
  }

  private onNativePlayerStateChanged = (newState: RelistenPlaybackState) => {
    if (this._state != newState) {
      this._state = newState;
      this.onStateChanged.dispatch(newState);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private onNativePlayerError = (error: RelistenErrorEvent) => {
    // TODO: show a pop up when there's a playback error? retry the request?
  };
  // endregion
}
