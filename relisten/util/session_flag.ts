import { useSyncExternalStore } from 'react';

/**
 * A boolean that lasts for the app session and can be read from any layout.
 * Use it for UI preferences shared across navigators, where context cannot
 * reach every reader.
 */
export function createSessionFlag(initialValue: boolean) {
  let value = initialValue;
  const listeners = new Set<() => void>();

  const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => listeners.delete(listener);
  };

  const getValue = () => value;

  return {
    set(nextValue: boolean) {
      if (value === nextValue) {
        return;
      }

      value = nextValue;
      listeners.forEach((listener) => listener());
    },
    useValue() {
      return useSyncExternalStore(subscribe, getValue);
    },
  };
}
