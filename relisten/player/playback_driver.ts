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
  isActive(): boolean;
  play(streamable: RelistenStreamable, queueContext?: PlaybackQueueContext): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  seekTo(pct: number): Promise<void>;
  seekToTime(timeMs: number): Promise<void>;
  setNextStream(streamable?: RelistenStreamable): void;
}

export class NativePlaybackDriver implements PlaybackDriver {
  name = 'native';

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
