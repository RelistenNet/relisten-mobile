import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export function observeOne<T>(observable: Observable<T[] | undefined>): Observable<T | undefined> {
  return observable.pipe(
    map((arr) => {
      if (arr === undefined || arr.length === 0) {
        return undefined;
      }

      if (arr.length === 1) {
        return arr[0];
      }

      throw new Error(`Expected only one result but got ${arr.length}`);
    })
  );
}
