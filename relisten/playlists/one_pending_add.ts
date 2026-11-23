/**
 * Lets the Add Tracks sheet run one add at a time. The lock is held for as
 * long as the task passed to `run` takes, so a second tap, on the same file
 * or another, can't insert anything meanwhile. To keep it held through a
 * duplicate prompt, the caller awaits the prompt inside the task, and the
 * prompt must always settle (Cancel included), or the lock is never released.
 * The sheet disables its other **+** buttons while `pendingTrackId` is set
 * and shows progress on that one.
 */
export class OnePendingAdd {
  private pendingTrackId: string | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): string | null => this.pendingTrackId;

  /** Runs `task` unless another add is pending, in which case it returns `busy`. */
  async run<T>(trackId: string, task: () => Promise<T>): Promise<T | 'busy'> {
    if (this.pendingTrackId !== null) {
      return 'busy';
    }

    this.setPending(trackId);
    try {
      return await task();
    } finally {
      this.setPending(null);
    }
  }

  private setPending(trackId: string | null) {
    this.pendingTrackId = trackId;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
