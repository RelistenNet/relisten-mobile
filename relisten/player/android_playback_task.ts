import { AppRegistry, Platform } from 'react-native';

if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask('RelistenPlayback', () => () => {
    // The media service finishes this task natively. Keeping it pending lets the
    // existing player use JS timers while the Activity is paused, without a UI.
    return new Promise<void>(() => {});
  });
}
