export interface ToastAction {
  label: string;
  onPress: () => void;
}

/**
 * - `info`: a confirmation or a note (the default).
 * - `warning`: something didn't happen as asked, and the app carried on.
 * - `error`: something failed; it stays up longer.
 */
export type ToastTone = 'info' | 'warning' | 'error';

export interface Toast {
  id: number;
  message: string;
  actions: ToastAction[];
  tone: ToastTone;
}

// One toast at a time: a new one replaces the current one. The host mounted at
// the app root (`ToastHost`) subscribes here, so any screen, sheet or service
// can show one. This module imports no UI, so the player and services can use
// it without import cycles.
let nextToastId = 1;
let listener: ((toast: Toast) => void) | null = null;

/** Called by `ToastHost`: receives each toast. */
export function subscribeToToasts(next: (toast: Toast) => void): () => void {
  listener = next;
  return () => {
    if (listener === next) {
      listener = null;
    }
  };
}

/**
 * A small message that sits just above the player, with optional text
 * actions such as Undo. It leaves on its own, on a downward swipe, or when an
 * action is chosen.
 */
export function showToast(
  message: string,
  { actions = [], tone = 'info' }: { actions?: ToastAction[]; tone?: ToastTone } = {}
) {
  listener?.({ id: nextToastId++, message, actions, tone });
}
