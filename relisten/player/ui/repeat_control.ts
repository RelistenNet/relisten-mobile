import type { RelistenPlayerQueue } from '@/relisten/player/relisten_player_queue';
import { PlayerRepeatState } from '@/relisten/player/player_modes';
import {
  nextSonosRepeatMode,
  type SonosRepeat,
  type SonosRepeatMode,
} from '@/relisten/sonos/sonos_playback';
import { roomRepeatOf, sonosRoom } from '@/relisten/sonos/sonos_room_store';

const NEXT_PHONE_REPEAT: Record<PlayerRepeatState, PlayerRepeatState> = {
  [PlayerRepeatState.REPEAT_OFF]: PlayerRepeatState.REPEAT_QUEUE,
  [PlayerRepeatState.REPEAT_QUEUE]: PlayerRepeatState.REPEAT_TRACK,
  [PlayerRepeatState.REPEAT_TRACK]: PlayerRepeatState.REPEAT_OFF,
};

const REPEAT_STATE_OF_SONOS: Record<SonosRepeatMode, PlayerRepeatState> = {
  off: PlayerRepeatState.REPEAT_OFF,
  all: PlayerRepeatState.REPEAT_QUEUE,
  one: PlayerRepeatState.REPEAT_TRACK,
};

/** How a room's repeat mode shows on the repeat button; an unread mode shows as off. */
export function repeatStateOfSonos(mode: SonosRepeatMode | null): PlayerRepeatState {
  return mode ? REPEAT_STATE_OF_SONOS[mode] : PlayerRepeatState.REPEAT_OFF;
}

/** Whether the repeat button can move on: a room may offer no repeat, or not be read yet. */
export function canCycleRepeat(roomRepeat: SonosRepeat | undefined): boolean {
  return roomRepeat === undefined || nextSonosRepeatMode(roomRepeat) !== undefined;
}

/**
 * Moves the repeat button to its next mode: off, then all, then one. On
 * Sonos, repeat is the room's own setting, kept apart from the phone's, and
 * modes the room doesn't offer are skipped. Returns false when nothing could
 * change (a room that offers no repeat, or one not read yet).
 */
export function cycleRepeat(queue: RelistenPlayerQueue): boolean {
  const roomRepeat = roomRepeatOf(sonosRoom.getState());
  if (roomRepeat) {
    const next = nextSonosRepeatMode(roomRepeat);
    if (next) {
      void sonosRoom.setRepeat(next);
    }
    return next !== undefined;
  }

  queue.setRepeatState(NEXT_PHONE_REPEAT[queue.repeatState]);
  return true;
}
