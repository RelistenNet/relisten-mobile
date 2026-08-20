import Realm from 'realm';

import { CarPlayScope } from '@/relisten/carplay/scope';
import {
  activeCatalogObjectForPrimaryKey,
  activeCatalogResults,
  isRetiredCatalogObject,
  readRetainedCatalogObject,
  retainedCatalogObjectForPrimaryKey,
} from '@/relisten/realm/catalog_retirement';
import {
  reportUnexpectedRetiredCatalogAccess,
  RetireableCatalogObject,
} from '@/relisten/realm/catalog_access_monitor';

export type CarPlayCatalogAccess = 'active' | 'retained';

export function catalogAccessForScope(scope: CarPlayScope): CarPlayCatalogAccess {
  return scope === 'browse' ? 'active' : 'retained';
}

export function catalogResultsForScope<T extends RetireableCatalogObject>(
  scope: CarPlayScope,
  results: Realm.Results<T>
): Realm.Results<T> {
  return scope === 'browse' ? activeCatalogResults(results) : results;
}

export function catalogObjectsForAccess<T extends RetireableCatalogObject>(
  objects: Iterable<T>,
  access: CarPlayCatalogAccess,
  accessSite: string
): T[] {
  const included: T[] = [];

  for (const object of objects) {
    if (access === 'active' && isRetiredCatalogObject(object)) {
      reportUnexpectedRetiredCatalogAccess(object, accessSite);
      continue;
    }

    if (access === 'retained') {
      readRetainedCatalogObject(object, accessSite);
    }

    included.push(object);
  }

  return included;
}

export function catalogObjectsForScope<T extends RetireableCatalogObject>(
  scope: CarPlayScope,
  objects: Iterable<T>,
  accessSite: string
): T[] {
  return catalogObjectsForAccess(objects, catalogAccessForScope(scope), accessSite);
}

export function selectedCatalogObjectForScope<T extends RetireableCatalogObject>(
  realm: Realm,
  scope: CarPlayScope,
  type: Realm.RealmObjectConstructor<T>,
  uuid: string,
  accessSite: string
): T | undefined {
  return scope === 'browse'
    ? activeCatalogObjectForPrimaryKey(realm, type, uuid as T[keyof T], accessSite)
    : retainedCatalogObjectForPrimaryKey(realm, type, uuid as T[keyof T], accessSite);
}

export function selectedCatalogObjectForAccess<T extends RetireableCatalogObject>(
  realm: Realm,
  access: CarPlayCatalogAccess,
  type: Realm.RealmObjectConstructor<T>,
  uuid: string,
  accessSite: string
): T | undefined {
  return access === 'active'
    ? activeCatalogObjectForPrimaryKey(realm, type, uuid as T[keyof T], accessSite)
    : retainedCatalogObjectForPrimaryKey(realm, type, uuid as T[keyof T], accessSite);
}
