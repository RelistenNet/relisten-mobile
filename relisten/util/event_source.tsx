export type EventSourceListener<T> = (value: T) => void;

export class EventSource<T> {
  public readonly listeners: Array<EventSourceListener<T>> = [];

  addListener(listener: EventSourceListener<T>) {
    this.listeners.push(listener);

    return () => this.removeListener(listener);
  }

  removeListener(listener: EventSourceListener<T>) {
    const removed = this.listeners.splice(this.listeners.indexOf(listener), 1);

    return removed.length > 0;
  }

  dispatch(event: T) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
