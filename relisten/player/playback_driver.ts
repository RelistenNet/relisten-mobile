import { nativePlayer, RelistenStreamable } from '@/modules/relisten-audio-player';
import {
  PlayerQueueTrack,
  PlayerRepeatState,
  PlayerShuffleState,
} from '@/relisten/player/relisten_player_queue';

export interface PlaybackQueueContext {
  orderedTracks: PlayerQueueTrack[];
  startIndex: number;
  startTimeMs?: number;
  repeatState: PlayerRepeatState;
  shuffleState: PlayerShuffleState;
  autoplay: boolean;
}

export interface PlaybackDriver {
  name: string;
  /**
   * Whether the player pauses the current stream before asking for another.
   * A Sonos room switches tracks itself and keeps play or pause, so pausing
   * first would leave it paused.
   */
  readonly pausesBeforeSwitching: boolean;
  /**
   * Whether the player keeps every track through the playing one in place,
   * as a Sonos room does. Shuffling then moves only the upcoming tracks.
   */
  readonly keepsPlayedOrder: boolean;
  isActive(): boolean;
  /**
   * Starts the selected occurrence. The player keeps this play request open
   * (`activePlayRequest`) until `currentTrackIdentifier` publishes the selected
   * identifier, and queues any later selection behind it. The native player
   * publishes it when the stream starts; a remote driver must publish it once
   * the remote player has moved, or has refused, or the request never ends.
   */
  play(streamable: RelistenStreamable, queueContext?: PlaybackQueueContext): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  seekTo(pct: number): Promise<void>;
  seekToTime(timeMs: number): Promise<void>;
  setNextStream(streamable?: RelistenStreamable): void;
  /**
   * Called before the queue removes the selected occurrence. A driver that
   * can't remove it, as Sonos keeps every track through the playing one, may
   * move on to the next instead and keep the occurrence; it returns true when
   * it has. Otherwise the player stops and the occurrence is removed.
   */
  moveOnFromSelected?(identifier: string): boolean;
}

export class NativePlaybackDriver implements PlaybackDriver {
  name = 'native';
  readonly pausesBeforeSwitching = true;
  readonly keepsPlayedOrder = false;

  isActive() {
    return true;
  }

  play(streamable: RelistenStreamable, queueContext?: PlaybackQueueContext): Promise<void> {
    const startingAtMs = queueContext?.startTimeMs;
    return nativePlayer.play(streamable, startingAtMs);
  }

  pause(): Promise<void> {
    return nativePlayer.pause();
  }

  resume(): Promise<void> {
    return nativePlayer.resume();
  }

  stop(): Promise<void> {
    return nativePlayer.stop();
  }

  seekTo(pct: number): Promise<void> {
    return nativePlayer.seekTo(pct);
  }

  seekToTime(timeMs: number): Promise<void> {
    return nativePlayer.seekToTime(timeMs);
  }

  setNextStream(streamable?: RelistenStreamable) {
    nativePlayer.setNextStream(streamable);
  }
}
