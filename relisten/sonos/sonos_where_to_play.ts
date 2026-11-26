import { Alert, Platform } from 'react-native';

/** Where the listener's Play goes: the Sonos room this phone controls, or the phone. */
export type PlayDestination = 'room' | 'phone';

/**
 * A paused room not seen playing, or chosen, for this long may be somewhere
 * the listener has left, so Play asks before going there.
 */
export const STALE_ROOM_MS = 15 * 60_000;

/**
 * Where a Play goes while this phone controls a room:
 * - the phone, when the room's latest read got no answer: it is out of reach;
 * - the room, while it plays, or when it was in use within `STALE_ROOM_MS`:
 *   the listener is most likely still near it;
 * - `ask` otherwise, since a room paused a while ago may be at home while
 *   the listener isn't. With the app in the background nothing can ask, so
 *   the room keeps it.
 */
export function playDestination({
  roomPlaying,
  lastInUseAt,
  lastReadFailed,
  appActive,
  now,
}: {
  roomPlaying: boolean;
  lastInUseAt: number | undefined;
  lastReadFailed: boolean;
  appActive: boolean;
  now: number;
}): PlayDestination | 'ask' {
  if (lastReadFailed) {
    return 'phone';
  }
  const recentlyInUse = lastInUseAt !== undefined && now - lastInUseAt < STALE_ROOM_MS;
  if (roomPlaying || recentlyInUse || !appActive) {
    return 'room';
  }
  return 'ask';
}

/**
 * Asks whether Play should go to a room that has been paused for a while.
 * Dismissing the question (Android's back button) keeps playback on the phone,
 * the choice that can't start music in a room nobody is in.
 */
export function askWhereToPlay(roomName: string): Promise<PlayDestination> {
  const phone = Platform.OS === 'ios' ? 'This iPhone' : 'This Phone';
  return new Promise((resolve) => {
    Alert.alert(
      `Play on ${roomName}?`,
      `${roomName} has been paused for a while.`,
      [
        { text: roomName, onPress: () => resolve('room') },
        { text: phone, style: 'cancel', onPress: () => resolve('phone') },
      ],
      { cancelable: true, onDismiss: () => resolve('phone') }
    );
  });
}
