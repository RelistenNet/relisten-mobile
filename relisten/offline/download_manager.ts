import {
  OFFLINE_DIRECTORIES_LEGACY,
  OFFLINE_DIRECTORY,
  SourceTrack,
} from '@/relisten/realm/models/source_track';
import {
  ACTIVE_SOURCE_TRACK_OFFLINE_INFO_QUERY,
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
  SourceTrackOfflineInfoType,
} from '@/relisten/realm/models/source_track_offline_info';
import { realm } from '@/relisten/realm/schema';
import { log } from '@/relisten/util/logging';
import { Realm } from '@realm/react';
import { Directory, File, Paths } from 'expo-file-system';
import ReactNativeBlobUtil, { FetchBlobResponse, StatefulPromise } from 'react-native-blob-util';
import { StatsigClientExpo } from '@statsig/expo-bindings';
import {
  downloadsResumedEvent,
  sharedStatsigClient,
  trackDownloadCompletedEvent,
  trackDownloadFailureEvent,
  trackDownloadIntegrityEvent,
  // trackDownloadQueuedEvent,
} from '@/relisten/events';
import {
  checkExpectedDownloadMd5,
  DownloadValidationResult,
  stringifyDownloadError,
  validateCompletedDownloadResponse,
} from '@/relisten/offline/download_validation';

const logger = log.extend('offline');

interface DownloadTask {
  id: string;
  generation: number;
  promise: StatefulPromise<FetchBlobResponse>;
}

export class DownloadManager {
  static SHARED_INSTANCE = new DownloadManager();
  static MAX_CONCURRENT_DOWNLOADS = 3;

  private remainingDownloadsListeners: Set<() => void> = new Set();
  private runningDownloadTasks: DownloadTask[] = [];
  private pendingDownloadTasks: Set<string> = new Set<string>();
  private removingDownloadTasks: Set<string> = new Set<string>();
  private statsig: StatsigClientExpo = sharedStatsigClient();

  subscribeRemainingDownloads = (listener: () => void) => {
    this.remainingDownloadsListeners.add(listener);

    return () => {
      this.remainingDownloadsListeners.delete(listener);
    };
  };

  async downloadTrack(sourceTrack: SourceTrack) {
    if (!realm) {
      logger.error('downloadTrack: No global Realm instance available.');
      return;
    }

    if (!sourceTrack.isValid()) {
      logger.warn('downloadTrack: Ignoring an invalid source track.');
      return;
    }

    let offlineInfo = this.activeOfflineInfo(sourceTrack);

    if (offlineInfo) {
      if (offlineInfo.type === SourceTrackOfflineInfoType.StreamingCache) {
        // Upgrade streaming cache to user download
        realm.write(() => {
          offlineInfo!.type = SourceTrackOfflineInfoType.UserInitiated;
        });

        return;
      } else if (offlineInfo.status !== SourceTrackOfflineInfoStatus.Failed) {
        logger.warn(`Source track already has offline info; skipping... ${offlineInfo.status}`);
      }
    }

    if (!offlineInfo) {
      realm.write(() => {
        const existing = realm!.objectForPrimaryKey(SourceTrackOfflineInfo, sourceTrack.uuid);
        const queuedAt = new Date();

        if (existing) {
          existing.deletedAt = undefined;
          existing.queuedAt = queuedAt;
          existing.status = SourceTrackOfflineInfoStatus.Queued;
          existing.type = SourceTrackOfflineInfoType.UserInitiated;
          existing.startedAt = undefined;
          existing.completedAt = undefined;
          existing.downloadedBytes = 0;
          existing.totalBytes = 0;
          existing.percent = 0;
          existing.errorInfo = undefined;
          offlineInfo = existing;
        } else {
          offlineInfo = new SourceTrackOfflineInfo(realm!, {
            sourceTrackUuid: sourceTrack.uuid,
            queuedAt,
            status: SourceTrackOfflineInfoStatus.Queued,
            type: SourceTrackOfflineInfoType.UserInitiated,
            deletedAt: undefined,
          });
        }

        sourceTrack.offlineInfo = offlineInfo;
      });

      this.emitRemainingDownloadsChanged();

      // this.statsig.logEvent(trackDownloadQueuedEvent(sourceTrack));
    } else if (offlineInfo.status !== SourceTrackOfflineInfoStatus.Succeeded) {
      this.emitRemainingDownloadsChanged();
    }

    await this.maybeCreateDownloadTask(sourceTrack, offlineInfo!);
  }

  markCachedFileAsAvailableOffline(sourceTrack: SourceTrack, totalBytes: number) {
    if (!realm) {
      logger.error('markCachedFileAsOffline: No global Realm instance available.');
      return;
    }

    if (!sourceTrack.isValid()) {
      logger.warn('markCachedFileAsAvailableOffline: Ignoring an invalid source track.');
      return;
    }

    let offlineInfo = this.activeOfflineInfo(sourceTrack);
    const activeDownloadTask = this.downloadTaskById(sourceTrack.uuid);
    if (activeDownloadTask) {
      activeDownloadTask.promise.cancel();
    }

    realm.write(() => {
      const d = new Date();

      if (!offlineInfo) {
        const existing = realm!.objectForPrimaryKey(SourceTrackOfflineInfo, sourceTrack.uuid);

        if (existing) {
          existing.deletedAt = undefined;
          existing.type = SourceTrackOfflineInfoType.StreamingCache;
          existing.queuedAt = d;
          existing.status = SourceTrackOfflineInfoStatus.Succeeded;
          existing.totalBytes = totalBytes;
          existing.downloadedBytes = totalBytes;
          existing.percent = 1;
          existing.startedAt = undefined;
          existing.completedAt = d;
          existing.errorInfo = undefined;
          offlineInfo = existing;
        } else {
          offlineInfo = new SourceTrackOfflineInfo(realm!, {
            sourceTrackUuid: sourceTrack.uuid,
            type: SourceTrackOfflineInfoType.StreamingCache,
            queuedAt: d,
            status: SourceTrackOfflineInfoStatus.Succeeded,
            totalBytes,
            downloadedBytes: totalBytes,
            percent: 1,
            completedAt: d,
            deletedAt: undefined,
          });
        }

        sourceTrack.offlineInfo = offlineInfo;
      } else if (offlineInfo.status !== SourceTrackOfflineInfoStatus.Succeeded) {
        // if it had been previously queued but streaming cache completed it mark it as completed
        offlineInfo.status = SourceTrackOfflineInfoStatus.Succeeded;
        offlineInfo.startedAt = undefined;
        offlineInfo.totalBytes = totalBytes;
        offlineInfo.downloadedBytes = totalBytes;
        offlineInfo.percent = 1;
        offlineInfo.completedAt = d;
      }
    });

    this.emitRemainingDownloadsChanged();
  }

  private maybeCreateDownloadTask(sourceTrack: SourceTrack, offlineInfo: SourceTrackOfflineInfo) {
    const slotsRemaining = this.availableDownloadSlots();

    if (slotsRemaining <= 0) {
      logger.debug(`No available download slot; slotsRemaining=${slotsRemaining}`);
      return null;
    }

    if (this.isPendingOrDownloading(sourceTrack)) {
      logger.debug(`${sourceTrack.uuid} is already pending or downloading`);
      return null;
    }

    return this.createDownloadTask(sourceTrack, offlineInfo);
  }

  private isPendingOrDownloading(sourceTrack: SourceTrack) {
    if (this.pendingDownloadTasks.has(sourceTrack.uuid)) {
      return true;
    }

    for (const task of this.runningDownloadTasks) {
      if (task.id === sourceTrack.uuid) {
        return true;
      }
    }

    return false;
  }

  private activeOfflineInfo(sourceTrack: SourceTrack) {
    const offlineInfo = sourceTrack.offlineInfo;

    if (!offlineInfo?.isValid() || offlineInfo.deletedAt) {
      return undefined;
    }

    return offlineInfo;
  }

  private availableDownloadSlots() {
    return (
      DownloadManager.MAX_CONCURRENT_DOWNLOADS -
      this.runningDownloadTasks.length -
      this.pendingDownloadTasks.size
    );
  }

  private async maybeStartQueuedDownloads() {
    const createdTasks = new Set<string>();

    if (!realm) {
      logger.error('maybeStartNextDownloadTasks: No global Realm instance available.');
      return createdTasks;
    }

    if (this.availableDownloadSlots() <= 0) {
      return createdTasks;
    }

    const queuedDownloads = realm
      .objects(SourceTrackOfflineInfo)
      .filtered(
        `${ACTIVE_SOURCE_TRACK_OFFLINE_INFO_QUERY} AND status == $0`,
        SourceTrackOfflineInfoStatus.Queued
      )
      .sorted('queuedAt')
      .slice(0, this.availableDownloadSlots());

    for (const queuedDownload of queuedDownloads) {
      const sourceTrack = queuedDownload.sourceTrack;

      if (!sourceTrack) {
        realm.write(() => {
          queuedDownload.deletedAt = new Date();
        });
        continue;
      }

      if (this.isPendingOrDownloading(sourceTrack)) {
        logger.debug(`${sourceTrack.uuid} is already pending or downloading`);
        continue;
      }

      const task = await this.createDownloadTask(sourceTrack, queuedDownload);

      createdTasks.add(task.id);
    }

    logger.debug(`Started createdTasks=${createdTasks.size} new download tasks`);

    return createdTasks;
  }

  private async createDownloadTask(sourceTrack: SourceTrack, offlineInfo: SourceTrackOfflineInfo) {
    logger.debug(
      `creating DownloadTask; sourceTrack.uuid=${sourceTrack.uuid}: mp3Url=${sourceTrack.streamingUrl()}`
    );

    this.emitRemainingDownloadsChanged();
    this.pendingDownloadTasks.add(sourceTrack.uuid);
    const destination = sourceTrack.downloadedFileLocation();

    // make sure the file doesn't already exist. the native code will error out. this should only be needed to recover
    // from strange error states/interactions with the streaming cache
    try {
      const offlineDir = new Directory(OFFLINE_DIRECTORY);
      offlineDir.create({ intermediates: true, idempotent: true });

      const destinationFile = new File(destination);
      if (destinationFile.exists) {
        destinationFile.delete();
      }
    } catch {
      /* empty */
    }

    const task = {
      id: sourceTrack.uuid,
      generation: Math.max(Date.now(), (offlineInfo.startedAt?.getTime() ?? 0) + 1),
      promise: ReactNativeBlobUtil.config({
        fileCache: true,
        Progress: { interval: 500, count: 10 },
        timeout: 30 * 1000,
      }).fetch('GET', sourceTrack.streamingUrl()),
    };

    // Ensure that when we call `.cancel()` later it does not throw an unhandled promise rejection error
    task.promise.catch((error) => {
      logger.info(`ReactNativeBlobUtil promise error: ${JSON.stringify(error)}`);
    });

    this.pendingDownloadTasks.delete(sourceTrack.uuid);
    this.runningDownloadTasks.push(task);

    realm!.write(() => {
      logger.debug(
        `${offlineInfo.sourceTrackUuid}: begin -> ${sourceTrack.downloadedFileLocation()}`
      );

      offlineInfo.status = SourceTrackOfflineInfoStatus.Downloading;
      offlineInfo.startedAt = new Date(task.generation);
    });

    this.attachDownloadHandlers(realm!, sourceTrack, offlineInfo!, task);

    return task;
  }

  async removeAllPendingDownloads() {
    // stop all active downloads
    for (const downloadTask of this.runningDownloadTasks) {
      downloadTask.promise.cancel();

      // no need to remove from the array because cancelling will cause the failure handler to remove it
    }

    if (realm) {
      const offlineInfos = realm
        .objects(SourceTrackOfflineInfo)
        .filtered(
          `${ACTIVE_SOURCE_TRACK_OFFLINE_INFO_QUERY} AND status != $0`,
          SourceTrackOfflineInfoStatus.Succeeded
        )
        .snapshot();
      const removals: Promise<void>[] = [];

      for (const offlineInfo of offlineInfos) {
        const sourceTrack = offlineInfo.sourceTrack;

        if (sourceTrack) {
          // Calling the async method starts its synchronous cancellation and
          // tombstoning work immediately. Await the group only after every
          // active row has been retired so cancellation callbacks cannot race
          // ahead and rewrite a still-active row.
          removals.push(this.removeDownload(sourceTrack));
        } else {
          realm.write(() => {
            offlineInfo.deletedAt = new Date();
          });
        }
      }

      await Promise.all(removals);
    }
  }

  async removeAllDownloads() {
    await this.removeAllPendingDownloads();

    if (realm) {
      const offlineInfos = realm
        .objects(SourceTrackOfflineInfo)
        .filtered(ACTIVE_SOURCE_TRACK_OFFLINE_INFO_QUERY)
        .snapshot();
      const removals: Promise<void>[] = [];

      for (const offlineInfo of offlineInfos) {
        const sourceTrack = offlineInfo.sourceTrack;

        if (sourceTrack) {
          removals.push(this.removeDownload(sourceTrack));
        } else {
          realm.write(() => {
            offlineInfo.deletedAt = new Date();
          });
        }
      }

      await Promise.all(removals);
    }
  }

  async removeAllLegacyDownloads() {
    for (const legacyPath of OFFLINE_DIRECTORIES_LEGACY) {
      // delete file, if it exists
      try {
        const legacyInfo = Paths.info(legacyPath);
        if (!legacyInfo.exists) {
          continue;
        }

        if (legacyInfo.isDirectory) {
          new Directory(legacyPath).delete();
        } else {
          new File(legacyPath).delete();
        }
      } catch {
        /* empty */
      }
    }
  }

  async retryFailedDownloads() {
    if (realm) {
      const offlineInfos = realm
        .objects(SourceTrackOfflineInfo)
        .filtered(
          `${ACTIVE_SOURCE_TRACK_OFFLINE_INFO_QUERY} AND status == $0`,
          SourceTrackOfflineInfoStatus.Failed
        )
        .snapshot();

      realm.write(() => {
        for (const offlineInfo of offlineInfos) {
          offlineInfo.status = SourceTrackOfflineInfoStatus.Queued;
          offlineInfo.completedAt = undefined;
        }
      });

      await this.maybeStartQueuedDownloads();
    }
  }

  async removeDownload(sourceTrack: SourceTrack) {
    if (!sourceTrack.isValid()) {
      logger.warn('removeDownload: Ignoring an invalid source track.');
      return;
    }

    const sourceTrackUuid = sourceTrack.uuid;
    const activeRealm = realm;

    if (!activeRealm) {
      logger.warn(`${sourceTrackUuid}: cannot remove download without an active Realm`);
      return;
    }

    if (this.removingDownloadTasks.has(sourceTrackUuid)) {
      logger.debug(`${sourceTrackUuid} is already being removed`);
      return;
    }

    this.removingDownloadTasks.add(sourceTrackUuid);

    try {
      // remove task, if it exists
      const task = this.downloadTaskById(sourceTrackUuid);

      if (task) {
        task.promise.cancel();
      }

      // delete file, if it exists
      const downloadedFileLocation = sourceTrack.downloadedFileLocation();
      let fileCleanupSucceeded = false;
      try {
        const downloadedFile = new File(downloadedFileLocation);
        if (downloadedFile.exists) {
          downloadedFile.delete();
        }

        fileCleanupSucceeded = !new File(downloadedFileLocation).exists;
      } catch (error) {
        logger.warn(
          `${sourceTrackUuid}: retaining offline info because its downloaded file could not be removed`,
          error
        );
      }

      if (!fileCleanupSucceeded) {
        return;
      }

      // remove SourceTrackOfflineInfo
      activeRealm.write(() => {
        if (!sourceTrack.isValid()) {
          return;
        }

        const offlineInfo = this.activeOfflineInfo(sourceTrack);

        sourceTrack.offlineInfo = undefined;
        if (offlineInfo) {
          offlineInfo.deletedAt = new Date();
        }
      });
    } finally {
      this.emitRemainingDownloadsChanged();
      this.removingDownloadTasks.delete(sourceTrackUuid);
    }
  }

  async resumeExistingDownloads() {
    if (!realm) {
      logger.error('downloadTrack: No global Realm instance available.');
      return;
    }

    // these are downloads that were in progress when the app was killed
    const stuckDownloads = realm
      .objects(SourceTrackOfflineInfo)
      .filtered(
        `${ACTIVE_SOURCE_TRACK_OFFLINE_INFO_QUERY} AND status == $0`,
        SourceTrackOfflineInfoStatus.Downloading
      )
      .snapshot();

    if (stuckDownloads.length > 0) {
      this.statsig.logEvent(downloadsResumedEvent(stuckDownloads.length));

      realm.write(() => {
        for (const stuckDownload of stuckDownloads) {
          stuckDownload.status = SourceTrackOfflineInfoStatus.Queued;
          stuckDownload.completedAt = undefined;
          stuckDownload.startedAt = undefined;
          stuckDownload.totalBytes = 0;
          stuckDownload.downloadedBytes = 0;
          stuckDownload.percent = 0;
        }
      });
    }

    const restartedTaskIds = await this.maybeStartQueuedDownloads();

    logger.info(`Restarted ${restartedTaskIds.size} downloads from orphaned offline info.`);
  }

  private downloadTaskById(id: string) {
    for (const task of this.runningDownloadTasks) {
      if (task.id === id) {
        return task;
      }
    }
  }

  private emitRemainingDownloadsChanged() {
    for (const listener of this.remainingDownloadsListeners) {
      listener();
    }
  }

  private writeProgress(
    realm: Realm,
    offlineInfo: SourceTrackOfflineInfo,
    downloadTask: DownloadTask,
    { bytesDownloaded, bytesTotal }: { bytesDownloaded: number; bytesTotal: number }
  ) {
    if (!offlineInfo.isValid() || offlineInfo.deletedAt) {
      return;
    }

    const percent = bytesDownloaded / bytesTotal;

    if (percent - offlineInfo.percent >= 0.1) {
      realm.write(() => {
        logger.debug(`${downloadTask.id}: progress; ${Math.floor(percent * 100)}`);

        offlineInfo.downloadedBytes = bytesDownloaded;
        offlineInfo.totalBytes = bytesTotal;
        offlineInfo.percent = percent;
      });
    }
  }

  private logTrackDownloadIntegrityAsync(
    sourceTrack: SourceTrack,
    path: string,
    validationResult: DownloadValidationResult
  ) {
    const eventBase = trackDownloadIntegrityEvent(sourceTrack, {
      ...validationResult,
      md5Status: 'pending',
    });
    const expectedMd5 = sourceTrack.mp3Md5;
    const sourceTrackUuid = sourceTrack.uuid;

    checkExpectedDownloadMd5(expectedMd5, path, sourceTrackUuid)
      .then((md5Status) => {
        this.statsig.logEvent({
          ...eventBase,
          metadata: {
            ...eventBase.metadata,
            md5Status,
          },
        });
      })
      .catch((error) => {
        logger.warn(`Could not log download integrity; sourceTrack.uuid=${sourceTrackUuid}`, error);
      });
  }

  private attachDownloadHandlers(
    realm: Realm,
    sourceTrack: SourceTrack,
    offlineInfo: SourceTrackOfflineInfo,
    downloadTask: DownloadTask
  ) {
    let offlineInfoRef = offlineInfo;
    const sourceTrackUuid = sourceTrack.uuid;
    const destinationPath = sourceTrack.downloadedFileLocation().replace('file://', '');

    const refreshOfflineInfo = () => {
      if (!offlineInfoRef.isValid()) {
        const newOfflineInfo = realm.objectForPrimaryKey<SourceTrackOfflineInfo>(
          SourceTrackOfflineInfo,
          sourceTrackUuid
        );

        if (newOfflineInfo && !newOfflineInfo.deletedAt) {
          offlineInfoRef = newOfflineInfo;
        } else {
          return;
        }
      }

      if (
        offlineInfoRef.deletedAt ||
        offlineInfoRef.status !== SourceTrackOfflineInfoStatus.Downloading ||
        offlineInfoRef.startedAt?.getTime() !== downloadTask.generation
      ) {
        return;
      }

      return offlineInfoRef;
    };

    downloadTask.promise
      .progress({ count: 10, interval: 500 }, (received, total) => {
        const oi = refreshOfflineInfo();

        if (!oi) {
          return;
        }

        this.writeProgress(realm, oi, downloadTask, {
          bytesDownloaded: Number(received),
          bytesTotal: Number(total),
        });
      })
      .then(async (res) => {
        const dest = destinationPath;
        const path = res.path().replace('file://', '');
        let validationResult: DownloadValidationResult;

        try {
          if (!refreshOfflineInfo()) {
            return;
          }

          validationResult = await validateCompletedDownloadResponse(res, path);

          if (!refreshOfflineInfo()) {
            return;
          }

          log.info(`${downloadTask.id}: copying ${path} to ${dest}`);

          if (!refreshOfflineInfo()) {
            return;
          }

          // The destination is cleared before this attempt starts. If another
          // writer recreated it while this request was in flight (notably the
          // native streaming cache), preserve that newer file instead of
          // unlinking it from an older completion callback.
          if (!(await ReactNativeBlobUtil.fs.exists(dest))) {
            if (!refreshOfflineInfo()) {
              return;
            }

            await ReactNativeBlobUtil.fs.mv(path, dest);
          }
        } finally {
          // if we encounter an error, clean up the temporary file
          try {
            await res.flush();
          } catch (e) {
            log.warn(`Failed to flush temporary download ${path}`, e);
          }
        }

        const oi = refreshOfflineInfo();

        if (!oi) {
          return;
        }

        realm.write(() => {
          logger.debug(`${downloadTask.id}: done`);
          oi.status = SourceTrackOfflineInfoStatus.Succeeded;
          oi.completedAt = new Date();
          oi.totalBytes = validationResult.contentLength ?? validationResult.downloadedBytes;
          oi.downloadedBytes = validationResult.downloadedBytes;
          oi.percent = 1.0;
          oi.errorInfo = undefined;
        });

        this.emitRemainingDownloadsChanged();

        this.statsig.logEvent(trackDownloadCompletedEvent(sourceTrack));
        this.logTrackDownloadIntegrityAsync(sourceTrack, dest, validationResult);
      })
      .catch((error) => {
        const oi = refreshOfflineInfo();

        if (!oi) {
          logger.debug(`${downloadTask.id}: stopped after its offline info was deleted`);
          return;
        }

        log.warn(`error downloading ${downloadTask.id}`, error);

        realm.write(() => {
          const errorInfo = stringifyDownloadError(error);

          logger.debug(`${downloadTask.id}: error; ${errorInfo}`);

          oi.errorInfo = errorInfo;

          if (!oi.errorInfo) {
            // first failure, let it try again
            oi.status = SourceTrackOfflineInfoStatus.Queued;
            oi.startedAt = undefined;
          } else {
            oi.status = SourceTrackOfflineInfoStatus.Failed;
            oi.completedAt = new Date();
          }
        });

        this.statsig.logEvent(trackDownloadFailureEvent(sourceTrack, oi));
      })
      .finally(() => {
        const taskIndex = this.runningDownloadTasks.indexOf(downloadTask);
        if (taskIndex >= 0) {
          this.runningDownloadTasks.splice(taskIndex, 1);
        }

        this.emitRemainingDownloadsChanged();
        this.maybeStartQueuedDownloads().then(() => {});
      });
  }
}
