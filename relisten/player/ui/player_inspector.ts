import { useSyncExternalStore } from 'react';

/**
 * Whether the listener wants the player inspector open in a wide window.
 * The split view layout, the mini player, and the full-screen overlay all
 * read it, and they live in different layouts, so it is a module store
 * rather than context. It starts open and lasts for the app session.
 */
let inspectorOpen = true;
const listeners = new Set<() => void>();

export function setPlayerInspectorOpen(open: boolean) {
  if (inspectorOpen === open) {
    return;
  }

  inspectorOpen = open;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

export function usePlayerInspectorOpen() {
  return useSyncExternalStore(subscribe, () => inspectorOpen);
}
