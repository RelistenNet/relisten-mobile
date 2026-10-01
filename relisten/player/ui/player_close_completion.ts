/** Owns the one pending close and gives each animation a fresh JS callback. */
export function createPlayerCloseCompletion(onClosed: () => void) {
  let pending: (() => void) | undefined;

  return {
    begin(afterClose?: () => void) {
      const complete = () => {
        if (pending !== complete) return;
        pending = undefined;
        onClosed();
        afterClose?.();
      };
      pending = complete;
      return complete;
    },
    cancel() {
      pending = undefined;
    },
  };
}
