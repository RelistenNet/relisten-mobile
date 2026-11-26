import { Alert, Platform } from 'react-native';

/** Where the listener chose to play: the Sonos room this phone controls, or the phone. */
export type PlayDestination = 'room' | 'phone';

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
