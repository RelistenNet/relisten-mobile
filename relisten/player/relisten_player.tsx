import {
  nativePlayer,
  RelistenErrorEvent,
  RelistenPlaybackState,
  RelistenRemoteControlEvent,
  RelistenTrackStreamingCacheCompleteEvent,
} from '@/modules/relisten-audio-player';
import {
  latestError,
  remoteControlEvent,
  state,
  trackStreamingCacheComplete,
} from '@/relisten/player/shared_state';
import { addPlayerListeners } from '@/relisten/player/native_playback_state_hooks';
import { RelistenPlayerQueue } from '@/relisten/player/relisten_player_queue';
import { EventSource } from '@/relisten/util/event_source';
import { DownloadManager } from '@/relisten/offline/download_manager';

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

  previous() {
    this.addPlayerListeners();

    const currentIdx = this.queue.currentIndex;

    if (!currentIdx) {
      return;
    }

    // TODO: if track.elapsed > 10 then instead of
    // switching to prior track, just restart the current one
    // if elapsed < 10, then go to prior track.

    this.queue.playTrackAtIndex(currentIdx - 1);
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
    remoteControlEvent.addListener(this.onRemoteControlEvent);
    trackStreamingCacheComplete.addListener(this.onTrackStreamingCacheComplete);
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
    this._queue.removePlayerListeners();

    this.addedPlayerListeners = false;
  }

  private onNativePlayerStateChanged = (newState: RelistenPlaybackState) => {
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private onNativePlayerError = (error: RelistenErrorEvent) => {
    // TODO: show a pop up when there's a playback error? retry the request?
  };
  // endregion
}
