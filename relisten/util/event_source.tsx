export type EventSourceListener<T> = (value: T) => void;

export class EventSource<T> {
  public readonly listeners: Array<EventSourceListener<T>> = [];

  addListener(listener: EventSourceListener<T>) {
    this.listeners.push(listener);

    return () => this.removeListener(listener);
  }

  removeListener(listener: EventSourceListener<T>) {
    const idx = this.listeners.indexOf(listener);
    if (idx === -1) {
      return false;
    }
    const removed = this.listeners.splice(idx, 1);

    return removed.length > 0;
  }

  dispatch(event: T) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
