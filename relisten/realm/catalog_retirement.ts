import Realm from 'realm';

import {
  reportRetainedCatalogAccess,
  reportUnexpectedIncompleteCatalogAccess,
  reportUnexpectedRetiredCatalogAccess,
  RetireableCatalogObject,
} from '@/relisten/realm/catalog_access_monitor';
import { catalogStructuralIssues } from '@/relisten/realm/catalog_integrity_validation';

export const ACTIVE_CATALOG_QUERY = 'retiredAt == nil';

export enum MissingCatalogObjectBehavior {
  Preserve = 'preserve',
  Retire = 'retire',
}

export function isRetiredCatalogObject(object: RetireableCatalogObject) {
  return object.retiredAt != null;
}

export function retireCatalogObject(
  object: RetireableCatalogObject,
  reason: string,
  retiredAt: Date = new Date()
) {
  if (isRetiredCatalogObject(object)) return false;

  object.retiredAt = retiredAt;
  object.retirementReason = reason;
  return true;
}

export function restoreCatalogObject(object: RetireableCatalogObject) {
  if (!isRetiredCatalogObject(object)) return false;

  object.retiredAt = undefined;
  object.retirementReason = undefined;
  return true;
}

export function activeCatalogResults<T extends RetireableCatalogObject>(
  results: Realm.Results<T>
): Realm.Results<T> {
  return results.filtered(ACTIVE_CATALOG_QUERY);
}

export function activeCatalogObjects<T extends RetireableCatalogObject>(
  realm: Realm,
  type: Realm.RealmObjectConstructor<T>
): Realm.Results<T> {
  return activeCatalogResults(realm.objects(type));
}

function structurallyCompleteCatalogObject<T extends RetireableCatalogObject>(
  object: T | null | undefined,
  accessSite: string
): T | undefined {
  if (!object) return undefined;

  const structuralIssues = catalogStructuralIssues(object);
  if (structuralIssues.length === 0) return object;

  reportUnexpectedIncompleteCatalogAccess(object, accessSite, structuralIssues);
  return undefined;
}

export function activeCatalogObjectForPrimaryKey<T extends RetireableCatalogObject>(
  realm: Realm,
  type: Realm.RealmObjectConstructor<T>,
  primaryKey: T[keyof T],
  accessSite: string
): T | undefined {
  return readActiveCatalogObject(realm.objectForPrimaryKey(type, primaryKey), accessSite);
}

export function readActiveCatalogObject<T extends RetireableCatalogObject>(
  object: T | null | undefined,
  accessSite: string
): T | undefined {
  const completeObject = structurallyCompleteCatalogObject(object, accessSite);
  if (!completeObject) return undefined;

  if (isRetiredCatalogObject(completeObject)) {
    reportUnexpectedRetiredCatalogAccess(completeObject, accessSite);
    return undefined;
  }

  return completeObject;
}

export function retainedCatalogObjectForPrimaryKey<T extends RetireableCatalogObject>(
  realm: Realm,
  type: Realm.RealmObjectConstructor<T>,
  primaryKey: T[keyof T],
  accessSite: string
): T | undefined {
  return readRetainedCatalogObject(realm.objectForPrimaryKey(type, primaryKey), accessSite);
}

export function readRetainedCatalogObject<T extends RetireableCatalogObject>(
  object: T | null | undefined,
  accessSite: string
): T | undefined {
  const completeObject = structurallyCompleteCatalogObject(object, accessSite);
  if (!completeObject) return undefined;

  reportRetainedCatalogAccess(completeObject, accessSite);
  return completeObject;
}
