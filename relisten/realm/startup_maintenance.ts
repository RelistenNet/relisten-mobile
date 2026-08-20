import * as Sentry from '@sentry/react-native';
import Realm from 'realm';

import {
  auditCatalogRetirementGraph,
  runColdStartCatalogGarbageCollection,
} from '@/relisten/realm/catalog_gc';
import { repairCatalogIntegrityAtStartup } from '@/relisten/realm/catalog_integrity';
import { cleanupPlaybackHistoryAtStartup } from '@/relisten/realm/models/history/playback_history_lifecycle';
import { collectTransientTombstonesAtStartup } from '@/relisten/realm/transient_tombstone_lifecycle';
import { log } from '@/relisten/util/logging';

const logger = log.extend('realm-startup-maintenance');
const completedRealmPaths = new Set<string>();

function runMaintenancePhase(phase: string, operation: () => unknown): void {
  try {
    operation();
  } catch (error) {
    logger.error(`Realm startup maintenance phase failed: ${phase}`, error);
    Sentry.captureException(error, {
      fingerprint: ['realm-startup-maintenance', phase],
      tags: { realm_maintenance_phase: phase },
    });
  }
}

/**
 * Runs destructive Realm maintenance before any app service, React tree, or
 * CarPlay template can retain managed objects. A failed phase is reported and
 * skipped for the rest of this JS session; retrying after consumers start would
 * violate the collector's safety contract.
 */
export function runRealmStartupMaintenance(realm: Realm): void {
  if (completedRealmPaths.has(realm.path)) return;

  runMaintenancePhase('catalog-integrity-repair', () => repairCatalogIntegrityAtStartup(realm));
  runMaintenancePhase('playback-history', () => cleanupPlaybackHistoryAtStartup(realm));
  runMaintenancePhase('transient-tombstones', () => collectTransientTombstonesAtStartup(realm));
  runMaintenancePhase('catalog-graph-audit', () => auditCatalogRetirementGraph(realm));
  runMaintenancePhase('catalog-garbage-collection', () =>
    runColdStartCatalogGarbageCollection(realm, { auditGraph: false })
  );

  completedRealmPaths.add(realm.path);
}

export function resetRealmStartupMaintenanceForTests() {
  completedRealmPaths.clear();
}
