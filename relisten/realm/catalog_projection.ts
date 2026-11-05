import Realm from 'realm';
import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { CatalogQueryState } from './models/catalog';

/** Decode saved child IDs for a detail query's selected Realm subscription. */
export function detailRowUuids(state: CatalogQueryState | null, prefix: 'show' | 'track') {
  const uuids: string[] = [];
  if (state?.hasAppliedData) {
    for (let index = 1; index < state.resultIds.length; index += 1) {
      try {
        uuids.push(decodeUuidCatalogId(state.resultIds[index], prefix));
      } catch {
        // Missing or invalid cached children leave the rendered projection incomplete.
      }
    }
  }
  return uuids;
}

export function uuidRows<T extends { uuid: string; deletedAt?: Date }>(
  query: Realm.Results<T>,
  uuids: readonly string[]
) {
  return query.filtered('uuid IN $0 AND deletedAt == nil', uuids);
}

/** Indexed access preserves Realm's cached row references and avoids iterator snapshots. */
export function indexRows<T>(rows: ArrayLike<T>, key: (row: T) => string) {
  const index = new Map<string, T>();
  const count = rows.length;
  for (let offset = 0; offset < count; offset += 1) {
    const row = rows[offset];
    index.set(key(row), row);
  }
  return index;
}

export function orderedUuidRows<T extends { uuid: string }>(
  rows: ArrayLike<T>,
  uuids: readonly string[]
) {
  const byUuid = indexRows(rows, (row) => row.uuid);
  const ordered: T[] = [];
  for (let index = 0; index < uuids.length; index += 1) {
    const row = byUuid.get(uuids[index]);
    if (row) {
      ordered.push(row);
    }
  }
  return ordered;
}
