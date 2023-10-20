import { EventSource } from '@/relisten/util/event_source';

export class SharedState<T> extends EventSource<T> {
  private _lastState: T | undefined = undefined;

  setState(value: T) {
    if (value !== this._lastState) {
      this.dispatch(value);

      this._lastState = value;
    }
  }

  lastState(): T | undefined {
    return this._lastState;
  }
}
