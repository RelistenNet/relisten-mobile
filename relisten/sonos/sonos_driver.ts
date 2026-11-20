import type { RelistenStreamable } from '@/modules/relisten-audio-player';
import type { PlaybackDriver, PlaybackQueueContext } from '@/relisten/player/playback_driver';
import type { SonosSession } from './sonos_session';

/**
 * The player's commands, sent to the Sonos room the session controls. The
 * room streams from the catalog itself, so the phone's streamable and next
 * stream go unused, and the room is paused rather than stopped.
 */
export class SonosPlaybackDriver implements PlaybackDriver {
  readonly name = 'sonos';
  readonly pausesBeforeSwitching = false;

  constructor(private readonly session: SonosSession) {}

  isActive() {
    return true;
  }

  play(_streamable: RelistenStreamable, queueContext?: PlaybackQueueContext): Promise<void> {
    return queueContext ? this.session.playOccurrence(queueContext) : Promise.resolve();
  }

  pause(): Promise<void> {
    return this.session.transport({ action: 'pause' });
  }

  resume(): Promise<void> {
    return this.session.transport({ action: 'play' });
  }

  stop(): Promise<void> {
    return this.session.transport({ action: 'pause' });
  }

  seekTo(pct: number): Promise<void> {
    return this.session.seekToFraction(pct);
  }

  seekToTime(timeMs: number): Promise<void> {
    return this.session.transport({ action: 'seek', positionMillis: timeMs });
  }

  setNextStream() {
    // Sonos reads ahead in its own queue.
  }

  moveOnFromSelected(identifier: string): boolean {
    return this.session.moveOnFromSelected(identifier);
  }
}
