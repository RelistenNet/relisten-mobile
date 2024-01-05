import Realm from 'realm';
import { PersistedFilter } from '@/relisten/components/filtering/filters';

export type PersistedFilters<K extends string> = { [persistenceKey in K]?: PersistedFilter<K> };

export function serializeFilters<K extends string>(filters: ReadonlyArray<PersistedFilter<K>>) {
  const p: PersistedFilters<K> = {};

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

  private _filters: PersistedFilters<any> | undefined;
  filters<K extends string>(): PersistedFilters<K> {
    // if (!this._filters) {
    this._filters = JSON.parse(this.rawFilters) as PersistedFilters<K>;
    // }

    return this._filters;
  }

  setFilters<K extends string>(filters: ReadonlyArray<PersistedFilter<K>>) {
    this.rawFilters = serializeFilters(filters);
  }
}
