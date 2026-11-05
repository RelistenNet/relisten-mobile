// Both player headers share this installation preference. It lives outside Realm
// because changing a time label does not change the listener's library or queue.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log } from '@/relisten/util/logging';

type PlaybackTimeDisplay = 'duration' | 'remaining';
const STORAGE_KEY = 'relisten.player.time-display';

class PlaybackTimePreference {
  private value: PlaybackTimeDisplay = 'duration';
  private listeners = new Set<() => void>();
  private loadPromise?: Promise<void>;
  private writes = Promise.resolve();
  private selectedInSession = false;

  getSnapshot = () => this.value;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Load once. A tap made before storage responds takes precedence. */
  load = () => {
    this.loadPromise ??= AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!this.selectedInSession && stored === 'remaining') {
          this.value = 'remaining';
          this.listeners.forEach((listener) => listener());
        }
      })
      .catch((error) => {
        log.warn('Unable to read player time display', error);
      });
    return this.loadPromise;
  };

  /** Publish immediately to both headers and preserve tap order when saving. */
  toggle = () => {
    this.selectedInSession = true;
    this.value = this.value === 'duration' ? 'remaining' : 'duration';
    this.listeners.forEach((listener) => listener());
    const value = this.value;
    this.writes = this.writes
      .then(() => AsyncStorage.setItem(STORAGE_KEY, value))
      .catch((error) => {
        log.warn('Unable to save player time display', error);
      });
    return this.writes;
  };
}

/** Shared total/remaining-time preference for the expanded and compact scrubbers. */
export const playbackTimePreference = new PlaybackTimePreference();
