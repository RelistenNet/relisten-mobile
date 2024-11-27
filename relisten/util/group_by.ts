export function groupBy<T>(
  list: ReadonlyArray<T | undefined | null>,
  keySelector: (obj: T) => string
): Record<string, T> {
  const r: { [key: string]: T } = {};

  for (const obj of list) {
    if (obj) {
      r[keySelector(obj)] = obj;
    }
  }

  return r;
}

export function aggregateBy<T>(
  list: ReadonlyArray<T>,
  keySelector: (obj: T) => string
): Record<string, ReadonlyArray<T>> {
  const r: { [key: string]: T[] } = {};

  for (const obj of list) {
    if (obj) {
      if (!r[keySelector(obj)]) {
        r[keySelector(obj)] = [];
      }
      r[keySelector(obj)].push(obj);
    }
  }

  return r;
}

export function groupByUuid<T extends { uuid: string }>(
  list: ReadonlyArray<T | undefined | null>
): Record<string, T> {
  return groupBy(list, (obj) => obj.uuid);
}

export function compactAndGroupBy<T>(
  list: ReadonlyArray<T | undefined | null>,
  keySelector: (obj: T) => string
): { values: ReadonlyArray<T>; grouped: Record<string, T> } {
  const values = list.filter((obj) => obj !== undefined && obj !== null) as T[];

  return { values, grouped: groupBy(values, keySelector) };
}

export function compactAndGroupByUuid<T extends { uuid: string }>(
  list: ReadonlyArray<T | undefined | null>
): { values: ReadonlyArray<T>; grouped: Record<string, T> } {
  return compactAndGroupBy(list, (obj) => obj.uuid);
}
