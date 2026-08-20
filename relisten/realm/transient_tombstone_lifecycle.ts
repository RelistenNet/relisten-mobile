import * as Sentry from '@sentry/react-native';
import Realm from 'realm';
import { File, Paths } from 'expo-file-system';
import { LastFmScrobbleEntry } from '@/relisten/realm/models/lastfm_scrobble_entry';
import { PlayerState } from '@/relisten/realm/models/player_state';
import { OFFLINE_DIRECTORY } from '@/relisten/realm/models/source_track';
import { SourceTrackOfflineInfo } from '@/relisten/realm/models/source_track_offline_info';
import { log } from '@/relisten/util/logging';

const logger = log.extend('transient-tombstone-lifecycle');
const DELETED_QUERY = 'deletedAt != nil';

export const DEFAULT_TRANSIENT_TOMBSTONE_STARTUP_CLEANUP_BATCH_LIMIT = 250;

interface TransientTombstoneCounts {
  sourceTrackOfflineInfos: number;
  playerStates: number;
  lastFmScrobbleEntries: number;
}

export interface TransientTombstoneCollectionResult extends TransientTombstoneCounts {
  deferred: TransientTombstoneCounts;
}

export interface TransientTombstoneCollectionOptions {
  batchLimitPerModel?: number;
  now?: Date;
}

/**
 * Physically collects transient tombstones. The startup gate must call this
 * before services, download callbacks, or React consumers acquire managed
 * objects from this Realm.
 */
export function collectTransientTombstonesAtStartup(
  realm: Realm,
  {
    batchLimitPerModel = DEFAULT_TRANSIENT_TOMBSTONE_STARTUP_CLEANUP_BATCH_LIMIT,
    now = new Date(),
  }: TransientTombstoneCollectionOptions = {}
): TransientTombstoneCollectionResult {
  if (!Number.isInteger(batchLimitPerModel) || batchLimitPerModel < 0) {
    throw new Error('Transient tombstone cleanup batchLimitPerModel must be non-negative');
  }

  const allSourceTrackOfflineInfos = realm
    .objects(SourceTrackOfflineInfo)
    .filtered(DELETED_QUERY)
    .sorted('deletedAt');
  const allPlayerStates = realm.objects(PlayerState).filtered(DELETED_QUERY).sorted('deletedAt');
  const allLastFmScrobbleEntries = realm
    .objects(LastFmScrobbleEntry)
    .filtered(DELETED_QUERY)
    .sorted('deletedAt');
  const sourceTrackOfflineInfos = allSourceTrackOfflineInfos
    .snapshot()
    .slice(0, batchLimitPerModel);
  const playerStates = allPlayerStates.snapshot().slice(0, batchLimitPerModel);
  const lastFmScrobbleEntries = allLastFmScrobbleEntries.snapshot().slice(0, batchLimitPerModel);

  const collectableSourceTrackOfflineInfos: SourceTrackOfflineInfo[] = [];
  const retryableSourceTrackOfflineInfos: SourceTrackOfflineInfo[] = [];

  for (const offlineInfo of sourceTrackOfflineInfos) {
    const path = Paths.join(OFFLINE_DIRECTORY, `${offlineInfo.sourceTrackUuid}.mp3`);

    try {
      const downloadedFile = new File(path);
      if (downloadedFile.exists) {
        downloadedFile.delete();
      }

      if (new File(path).exists) {
        logger.warn(
          `${offlineInfo.sourceTrackUuid}: deferring offline-info collection because its file still exists`
        );
        retryableSourceTrackOfflineInfos.push(offlineInfo);
        continue;
      }

      collectableSourceTrackOfflineInfos.push(offlineInfo);
    } catch (error) {
      logger.warn(
        `${offlineInfo.sourceTrackUuid}: deferring offline-info collection after file cleanup failed`,
        error
      );
      retryableSourceTrackOfflineInfos.push(offlineInfo);
    }
  }

  const result = {
    sourceTrackOfflineInfos: collectableSourceTrackOfflineInfos.length,
    playerStates: playerStates.length,
    lastFmScrobbleEntries: lastFmScrobbleEntries.length,
    deferred: {
      sourceTrackOfflineInfos:
        allSourceTrackOfflineInfos.length - collectableSourceTrackOfflineInfos.length,
      playerStates: allPlayerStates.length - playerStates.length,
      lastFmScrobbleEntries: allLastFmScrobbleEntries.length - lastFmScrobbleEntries.length,
    },
  };
  const totalCollected =
    result.sourceTrackOfflineInfos + result.playerStates + result.lastFmScrobbleEntries;
  const totalDeferred =
    result.deferred.sourceTrackOfflineInfos +
    result.deferred.playerStates +
    result.deferred.lastFmScrobbleEntries;

  if (totalCollected === 0 && totalDeferred === 0) return result;

  realm.write(() => {
    // Move failed file-cleanup attempts to the back of the oldest-first queue
    // so a permanently blocked path cannot starve later tombstones forever.
    for (const offlineInfo of retryableSourceTrackOfflineInfos) {
      if (offlineInfo.isValid() && offlineInfo.deletedAt != null) offlineInfo.deletedAt = now;
    }

    for (const offlineInfo of collectableSourceTrackOfflineInfos) {
      for (const sourceTrack of Array.from(offlineInfo.sourceTracks)) {
        if (!sourceTrack.isValid()) {
          continue;
        }

        const linkedOfflineInfo = sourceTrack.offlineInfo;
        if (
          linkedOfflineInfo?.isValid() &&
          linkedOfflineInfo.sourceTrackUuid === offlineInfo.sourceTrackUuid
        ) {
          sourceTrack.offlineInfo = undefined;
        }
      }
    }

    if (collectableSourceTrackOfflineInfos.length > 0) {
      realm.delete(collectableSourceTrackOfflineInfos);
    }
    if (playerStates.length > 0) {
      realm.delete(playerStates);
    }
    if (lastFmScrobbleEntries.length > 0) {
      realm.delete(lastFmScrobbleEntries);
    }
  });

  logger.info('Collected or deferred transient Realm tombstones at startup.', result);

  if (totalDeferred > 0) {
    Sentry.addBreadcrumb({
      category: 'realm.transient-tombstone.cleanup',
      level: 'info',
      message: 'Transient Realm tombstone collection deferred to a later reboot',
      data: { batchLimitPerModel, ...result.deferred },
    });
  }

  return result;
}
