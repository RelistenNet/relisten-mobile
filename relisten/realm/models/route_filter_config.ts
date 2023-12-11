import Realm from 'realm';
import { PersistedFilter } from '@/relisten/components/filtering/filters';

export type PersistedFilters = { [persistenceKey: string]: PersistedFilter };

export function serializeFilters(filters: ReadonlyArray<PersistedFilter>) {
  const p: PersistedFilters = {};

  for (const filter of filters) {
    p[filter.persistenceKey] = {
      persistenceKey: filter.persistenceKey,
      sortDirection: filter.sortDirection,
      active: filter.active,
    };
  }

  return JSON.stringify(p);
}

export class RouteFilterConfig extends Realm.Object<RouteFilterConfig> {
  static schema: Realm.ObjectSchema = {
    name: 'RouteFilterConfig',
    primaryKey: 'key',
    properties: {
      key: 'string',
      rawFilters: 'string',
    },
  };

  key!: string;
  rawFilters!: string;

  filters(): PersistedFilter[] {
    return Object.values(JSON.parse(this.rawFilters) as PersistedFilters);
  }

  setFilters(filters: ReadonlyArray<PersistedFilter>) {
    this.rawFilters = serializeFilters(filters);
  }
}
