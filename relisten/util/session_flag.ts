import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * A boolean UI preference that any layout can read, for preferences shared
 * across navigators where context cannot reach every reader.
 *
 * With a `storageKey` it is remembered across launches: the stored value
 * replaces the initial one once AsyncStorage answers, unless the listener
 * changed it first.
 */
export function createSessionFlag(initialValue: boolean, storageKey?: string) {
  let value = initialValue;
  let changedBeforeLoad = false;
  const listeners = new Set<() => void>();

  const publish = (nextValue: boolean) => {
    if (value === nextValue) {
      return;
    }

    value = nextValue;
    listeners.forEach((listener) => listener());
  };

  if (storageKey) {
    void AsyncStorage.getItem(storageKey).then((stored) => {
      if (stored !== null && !changedBeforeLoad) {
        publish(stored === 'true');
      }
    });
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => listeners.delete(listener);
  };

  const getValue = () => value;

  return {
    set(nextValue: boolean) {
      changedBeforeLoad = true;
      publish(nextValue);

      if (storageKey) {
        void AsyncStorage.setItem(storageKey, String(nextValue));
      }
    },
    useValue() {
      return useSyncExternalStore(subscribe, getValue);
    },
  };
}
