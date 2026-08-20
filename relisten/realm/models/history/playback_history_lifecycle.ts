import * as Sentry from '@sentry/react-native';
import Realm from 'realm';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { log } from '@/relisten/util/logging';
import { readRetainedCatalogObject } from '@/relisten/realm/catalog_retirement';

const logger = log.extend('playback-history-lifecycle');

/**
 * A history entry is visible only while it has not been cleared and all links
 * required by history consumers still resolve. The link checks also quarantine
 * databases written by older versions that physically deleted catalog rows.
 */
export const ACTIVE_PLAYBACK_HISTORY_QUERY =
  'deletedAt == nil AND sourceTrack != nil AND artist != nil AND show != nil AND source != nil ' +
  'AND sourceTrack.artist != nil AND sourceTrack.show != nil ' +
  'AND sourceTrack.source != nil AND sourceTrack.year != nil';

const MALFORMED_PLAYBACK_HISTORY_QUERY =
  'deletedAt == nil AND (sourceTrack == nil OR artist == nil OR show == nil OR source == nil ' +
  'OR sourceTrack.artist == nil OR sourceTrack.show == nil ' +
  'OR sourceTrack.source == nil OR sourceTrack.year == nil)';

export const DEFAULT_PLAYBACK_HISTORY_STARTUP_CLEANUP_BATCH_LIMIT = 250;

export interface PlaybackHistoryStartupCleanupResult {
  physicallyDeleted: number;
  malformed: number;
  newlyQuarantined: number;
  collectionDeferred: number;
  quarantineDeferred: number;
  deferred: number;
  previouslyCleared: number;
}

export interface PlaybackHistoryStartupCleanupOptions {
  batchLimit?: number;
  quarantineBatchLimit?: number;
  now?: Date;
}

export type PlaybackHistoryCatalogLinks = Pick<
  PlaybackHistoryEntry,
  'sourceTrack' | 'artist' | 'show' | 'source'
>;

/**
 * History deliberately retains its catalog links after those rows leave the
 * current catalog. Record that expected use without treating it as an
 * active-catalog invariant violation.
 */
export function readRetainedPlaybackHistoryCatalogLinks<T extends PlaybackHistoryCatalogLinks>(
  links: T,
  accessSite: string
): T {
  readRetainedCatalogObject(links.sourceTrack, `${accessSite}.sourceTrack`);
  readRetainedCatalogObject(links.artist, `${accessSite}.artist`);
  readRetainedCatalogObject(links.show, `${accessSite}.show`);
  readRetainedCatalogObject(links.source, `${accessSite}.source`);
  return links;
}

export function activePlaybackHistoryEntries(realm: Realm): Realm.Results<PlaybackHistoryEntry> {
  return realm.objects(PlaybackHistoryEntry).filtered(ACTIVE_PLAYBACK_HISTORY_QUERY);
}

export function activePlaybackHistoryEntryForPrimaryKey(
  realm: Realm,
  uuid: string
): PlaybackHistoryEntry | undefined {
  return activePlaybackHistoryEntries(realm).filtered('uuid == $0', uuid)[0];
}

export function softDeletePlaybackHistoryEntries(
  realm: Realm,
  entries: Realm.Results<PlaybackHistoryEntry> = activePlaybackHistoryEntries(realm),
  deletedAt: Date = new Date()
): number {
  const entriesToDelete = entries.filtered('deletedAt == nil').snapshot();
  const count = entriesToDelete.length;

  if (count === 0) {
    return 0;
  }

  const markDeleted = () => {
    for (const entry of entriesToDelete) {
      if (entry && entry.deletedAt == null) {
        entry.deletedAt = deletedAt;
      }
    }
  };

  if (realm.isInTransaction) {
    markDeleted();
  } else {
    realm.write(markDeleted);
  }

  return count;
}

/**
 * Physically removes history that no live consumer is allowed to observe.
 * Call this once during Realm startup, before rendering services or opening
 * CarPlay, so normal in-session clears never invalidate managed objects.
 */
export function cleanupPlaybackHistoryAtStartup(
  realm: Realm,
  {
    batchLimit = DEFAULT_PLAYBACK_HISTORY_STARTUP_CLEANUP_BATCH_LIMIT,
    quarantineBatchLimit = batchLimit,
    now = new Date(),
  }: PlaybackHistoryStartupCleanupOptions = {}
): PlaybackHistoryStartupCleanupResult {
  if (!Number.isInteger(batchLimit) || batchLimit < 0) {
    throw new Error('Playback history cleanup batchLimit must be a non-negative integer');
  }
  if (!Number.isInteger(quarantineBatchLimit) || quarantineBatchLimit < 0) {
    throw new Error('Playback history quarantineBatchLimit must be a non-negative integer');
  }

  const allEntries = realm.objects(PlaybackHistoryEntry);
  const previouslyClearedEntries = allEntries.filtered('deletedAt != nil').sorted('deletedAt');
  const previouslyCleared = previouslyClearedEntries.length;
  const entriesToDelete = previouslyClearedEntries.snapshot().slice(0, batchLimit);
  const malformedResults = allEntries.filtered(MALFORMED_PLAYBACK_HISTORY_QUERY);
  const malformed = malformedResults.length;
  const malformedEntries = malformedResults.snapshot().slice(0, quarantineBatchLimit);
  const newlyQuarantined = malformedEntries.length;
  const physicallyDeleted = entriesToDelete.length;
  const collectionDeferred = previouslyCleared - physicallyDeleted;
  const quarantineDeferred = malformed - newlyQuarantined;
  const deferred = collectionDeferred + quarantineDeferred;

  if (physicallyDeleted > 0 || newlyQuarantined > 0) {
    const maintainEntries = () => {
      for (const entry of malformedEntries) {
        if (entry?.isValid() && entry.deletedAt == null) entry.deletedAt = now;
      }
      if (entriesToDelete.length > 0) realm.delete(entriesToDelete);
    };

    if (realm.isInTransaction) {
      maintainEntries();
    } else {
      realm.write(maintainEntries);
    }

    logger.info('Quarantined or collected unusable playback history during startup', {
      deferred,
      collectionDeferred,
      malformed,
      newlyQuarantined,
      physicallyDeleted,
      previouslyCleared,
      quarantineDeferred,
    });
  }

  if (deferred > 0) {
    Sentry.addBreadcrumb({
      category: 'realm.playback-history.cleanup',
      level: 'info',
      message: 'Playback history maintenance deferred to a later reboot',
      data: {
        batchLimit,
        collectionDeferred,
        deferred,
        previouslyCleared,
        quarantineBatchLimit,
        quarantineDeferred,
      },
    });
  }

  return {
    physicallyDeleted,
    malformed,
    newlyQuarantined,
    collectionDeferred,
    quarantineDeferred,
    deferred,
    previouslyCleared,
  };
}
