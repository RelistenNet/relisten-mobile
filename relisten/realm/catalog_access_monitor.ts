import * as Sentry from '@sentry/react-native';
import { AnyRealmObject } from 'realm';

import { CatalogRetirementState } from '@/relisten/realm/catalog_retirement_schema';
import { log } from '@/relisten/util/logging';

const logger = log.extend('catalog-access');
const accessCounts = new Map<string, number>();
const retainedAccessCounts = new Map<string, number>();
const incompleteAccessCounts = new Map<string, number>();

export type RetireableCatalogObject = AnyRealmObject &
  CatalogRetirementState & {
    uuid: string;
  };

function safeObjectIdentity(object: RetireableCatalogObject) {
  let modelName = 'UnknownCatalogObject';
  let uuid = 'unknown';

  try {
    modelName = object.objectSchema().name;
  } catch {
    // A deleted managed object may no longer expose schema metadata.
  }
  try {
    if (object.isValid()) uuid = object.uuid;
  } catch {
    // Identity is diagnostic-only; never let it recreate the invalid access.
  }

  return { modelName, uuid };
}

function isPowerOfTwo(value: number) {
  return value > 0 && (value & (value - 1)) === 0;
}

export function reportUnexpectedRetiredCatalogAccess(
  object: RetireableCatalogObject,
  accessSite: string
) {
  const modelName = object.objectSchema().name;
  const key = `${modelName}:${accessSite}`;
  const count = (accessCounts.get(key) ?? 0) + 1;
  accessCounts.set(key, count);

  if (isPowerOfTwo(count)) {
    Sentry.addBreadcrumb({
      category: 'realm.catalog-retirement',
      level: 'warning',
      message: `Retired ${modelName} reached an active-only boundary`,
      data: {
        accessSite,
        count,
        retiredAt: object.retiredAt?.toISOString(),
        retirementReason: object.retirementReason,
        uuid: object.uuid,
      },
    });
  }

  if (count === 1) {
    logger.warn(
      `Retired ${modelName} reached active-only boundary ${accessSite}; uuid=${object.uuid}`
    );
    Sentry.captureMessage('Retired Realm catalog object reached an active-only boundary', {
      level: 'warning',
      fingerprint: ['realm-retired-catalog-access', modelName, accessSite],
      tags: {
        access_site: accessSite,
        realm_model: modelName,
      },
      extra: {
        retiredAt: object.retiredAt?.toISOString(),
        retirementReason: object.retirementReason,
        uuid: object.uuid,
      },
    });
  }
}

export function reportUnexpectedIncompleteCatalogAccess(
  object: RetireableCatalogObject,
  accessSite: string,
  issues: ReadonlyArray<string>
) {
  const { modelName, uuid } = safeObjectIdentity(object);
  const issueKey = issues.join(',');
  const key = `${modelName}:${accessSite}:${issueKey}`;
  const count = (incompleteAccessCounts.get(key) ?? 0) + 1;
  incompleteAccessCounts.set(key, count);

  if (isPowerOfTwo(count)) {
    Sentry.addBreadcrumb({
      category: 'realm.catalog-integrity.access',
      level: 'warning',
      message: `Structurally incomplete ${modelName} reached a catalog boundary`,
      data: { accessSite, count, issues, uuid },
    });
  }

  if (count === 1) {
    logger.warn(
      `Structurally incomplete ${modelName} reached ${accessSite}; uuid=${uuid}; issues=${issueKey}`
    );
    Sentry.captureMessage('Structurally incomplete Realm catalog object was accessed', {
      level: 'warning',
      fingerprint: ['realm-incomplete-catalog-access', modelName, accessSite],
      tags: {
        access_site: accessSite,
        realm_model: modelName,
      },
      extra: { issues, uuid },
    });
  }
}

export function reportCatalogMaintenance(
  operation: 'retired' | 'restored' | 'collected' | 'collection-skipped',
  modelName: string,
  count: number,
  data: Record<string, unknown> = {}
) {
  if (count === 0) return;

  Sentry.addBreadcrumb({
    category: 'realm.catalog-retirement',
    level: operation === 'collection-skipped' ? 'warning' : 'info',
    message: `Catalog objects ${operation}`,
    data: { count, modelName, ...data },
  });
}

export function reportRetainedCatalogAccess(object: RetireableCatalogObject, accessSite: string) {
  if (!object.retiredAt) return;

  const modelName = object.objectSchema().name;
  const key = `${modelName}:${accessSite}`;
  const count = (retainedAccessCounts.get(key) ?? 0) + 1;
  retainedAccessCounts.set(key, count);

  if (isPowerOfTwo(count)) {
    Sentry.addBreadcrumb({
      category: 'realm.catalog-retirement.retained-access',
      level: 'info',
      message: `Retired ${modelName} used by a retained-data path`,
      data: {
        accessSite,
        count,
        retiredAt: object.retiredAt.toISOString(),
        retirementReason: object.retirementReason,
        uuid: object.uuid,
      },
    });
  }

  if (count === 1) {
    logger.info(`Retired ${modelName} retained at ${accessSite}; uuid=${object.uuid}`);
  }
}

export function resetCatalogAccessMonitorForTests() {
  accessCounts.clear();
  retainedAccessCounts.clear();
  incompleteAccessCounts.clear();
}
