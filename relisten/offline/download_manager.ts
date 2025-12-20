import {
  OFFLINE_DIRECTORIES_LEGACY,
  OFFLINE_DIRECTORY,
  SourceTrack,
} from '@/relisten/realm/models/source_track';
import {
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
  trackDownloadQueuedEvent,
} from '@/relisten/events';

const logger = log.extend('offline');

interface DownloadTask {
  id: string;
  promise: StatefulPromise<FetchBlobResponse>;
}

export class DownloadManager {
  static SHARED_INSTANCE = new DownloadManager();
  static MAX_CONCURRENT_DOWNLOADS = 3;

  private runningDownloadTasks: DownloadTask[] = [];
  private pendingDownloadTasks: Set<string> = new Set<string>();
  private statsig: StatsigClientExpo = sharedStatsigClient();

  async downloadTrack(sourceTrack: SourceTrack) {
    if (!realm) {
      logger.error('downloadTrack: No global Realm instance available.');
      return;
    }

    if (sourceTrack.offlineInfo) {
      if (sourceTrack.offlineInfo.type === SourceTrackOfflineInfoType.StreamingCache) {
        // Upgrade streaming cache to user download
        realm.write(() => {
          sourceTrack.offlineInfo!.type = SourceTrackOfflineInfoType.UserInitiated;
        });

        return;
      } else if (sourceTrack.offlineInfo.status !== SourceTrackOfflineInfoStatus.Failed) {
        logger.warn(
          `Source track already has offline info; skipping... ${sourceTrack.offlineInfo.status}`
        );
      }
    }

    let offlineInfo: SourceTrackOfflineInfo | undefined = sourceTrack.offlineInfo;

    if (!offlineInfo) {
      realm.write(() => {
        offlineInfo = new SourceTrackOfflineInfo(realm!, {
          sourceTrackUuid: sourceTrack.uuid,
          queuedAt: new Date(),
          status: SourceTrackOfflineInfoStatus.Queued,
          type: SourceTrackOfflineInfoType.UserInitiated,
        });

        sourceTrack.offlineInfo = offlineInfo;
      });

      this.statsig.logEvent(trackDownloadQueuedEvent(sourceTrack));
    }

    await this.maybeCreateDownloadTask(sourceTrack, offlineInfo!);
  }

  markCachedFileAsAvailableOffline(sourceTrack: SourceTrack, totalBytes: number) {
    if (!realm) {
      logger.error('markCachedFileAsOffline: No global Realm instance available.');
      return;
    }

    let offlineInfo: SourceTrackOfflineInfo | undefined = sourceTrack.offlineInfo;

    realm.write(() => {
      const d = new Date();

      if (!offlineInfo) {
        offlineInfo = new SourceTrackOfflineInfo(realm!, {
          sourceTrackUuid: sourceTrack.uuid,
          type: SourceTrackOfflineInfoType.StreamingCache,
          queuedAt: d,
          status: SourceTrackOfflineInfoStatus.Succeeded,
          totalBytes,
          downloadedBytes: totalBytes,
          percent: 1,
          completedAt: d,
        });

        sourceTrack.offlineInfo = offlineInfo;
      } else if (offlineInfo.status !== SourceTrackOfflineInfoStatus.Succeeded) {
        // if it had been previously queued but streaming cache completed it mark it as completed
        offlineInfo.status = SourceTrackOfflineInfoStatus.Succeeded;
        offlineInfo.totalBytes = totalBytes;
        offlineInfo.downloadedBytes = totalBytes;
        offlineInfo.percent = 1;
        offlineInfo.completedAt = d;
      }
    });
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
      .filtered('status == $0', SourceTrackOfflineInfoStatus.Queued)
      .sorted('queuedAt')
      .slice(0, this.availableDownloadSlots());

    for (const queuedDownload of queuedDownloads) {
      if (this.isPendingOrDownloading(queuedDownload.sourceTrack)) {
        logger.debug(`${queuedDownload.sourceTrack.uuid} is already pending or downloading`);
        continue;
      }

      const task = await this.createDownloadTask(queuedDownload.sourceTrack, queuedDownload);

      createdTasks.add(task.id);
    }

    logger.debug(`Started createdTasks=${createdTasks.size} new download tasks`);

    return createdTasks;
  }

  private async createDownloadTask(sourceTrack: SourceTrack, offlineInfo: SourceTrackOfflineInfo) {
    logger.debug(
      `creating DownloadTask; sourceTrack.uuid=${sourceTrack.uuid}: mp3Url=${sourceTrack.streamingUrl()}`
    );

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
      offlineInfo.startedAt = new Date();
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
        .filtered('status != $0', SourceTrackOfflineInfoStatus.Succeeded);

      for (const offlineInfo of offlineInfos) {
        await this.removeDownload(offlineInfo.sourceTrack);
      }
    }
  }

  async removeAllDownloads() {
    await this.removeAllPendingDownloads();

    if (realm) {
      const offlineInfos = realm.objects(SourceTrackOfflineInfo);

      for (const offlineInfo of offlineInfos) {
        await this.removeDownload(offlineInfo.sourceTrack);
      }
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
        .filtered('status == $0', SourceTrackOfflineInfoStatus.Failed);

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
    // remove task, if it exists
    const task = this.downloadTaskById(sourceTrack.uuid);

    if (task) {
      task.promise.cancel();
    }

    // delete file, if it exists
    try {
      const downloadedFile = new File(sourceTrack.downloadedFileLocation());
      if (downloadedFile.exists) {
        downloadedFile.delete();
      }
    } catch {
      /* empty */
    }

    // remove SourceTrackOfflineInfo
    if (realm) {
      realm.write(() => {
        const offlineInfo = sourceTrack.offlineInfo;

        sourceTrack.offlineInfo = undefined;
        realm!.delete(offlineInfo);
      });
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
      .filtered('status == $0', SourceTrackOfflineInfoStatus.Downloading);

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

  private writeProgress(
    realm: Realm,
    offlineInfo: SourceTrackOfflineInfo,
    downloadTask: DownloadTask,
    { bytesDownloaded, bytesTotal }: { bytesDownloaded: number; bytesTotal: number }
  ) {
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

  private attachDownloadHandlers(
    realm: Realm,
    sourceTrack: SourceTrack,
    offlineInfo: SourceTrackOfflineInfo,
    downloadTask: DownloadTask
  ) {
    let offlineInfoRef = offlineInfo;

    const refreshOfflineInfo = () => {
      if (!offlineInfoRef.isValid()) {
        const newOfflineInfo = realm.objectForPrimaryKey<SourceTrackOfflineInfo>(
          SourceTrackOfflineInfo,
          sourceTrack.uuid
        );

        if (newOfflineInfo) {
          offlineInfoRef = newOfflineInfo;
        } else {
          return;
        }
      }

      if (offlineInfoRef.status !== SourceTrackOfflineInfoStatus.Downloading) {
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
        const dest = sourceTrack.downloadedFileLocation().replace('file://', '');
        const path = res.path().replace('file://', '');

        log.info(`${downloadTask.id}: copying ${path} to ${dest}`);

        try {
          if (await ReactNativeBlobUtil.fs.exists(dest)) {
            await ReactNativeBlobUtil.fs.unlink(dest);
          }
          await ReactNativeBlobUtil.fs.mv(path, dest);
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
          oi.downloadedBytes = oi.totalBytes;
          oi.percent = 1.0;
          oi.errorInfo = undefined;
        });

        this.statsig.logEvent(trackDownloadCompletedEvent(sourceTrack));

        this.runningDownloadTasks.splice(this.runningDownloadTasks.indexOf(downloadTask), 1);
        this.maybeStartQueuedDownloads().then(() => {});
      })
      .catch((error) => {
        log.warn(`error downloading ${downloadTask.id}`, error);

        const oi = refreshOfflineInfo();

        if (!oi) {
          return;
        }

        realm.write(() => {
          logger.debug(`${downloadTask.id}: error; ${JSON.stringify(error)}`);

          oi.errorInfo = JSON.stringify(error);

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

        this.runningDownloadTasks.splice(this.runningDownloadTasks.indexOf(downloadTask), 1);
        this.maybeStartQueuedDownloads().then(() => {});
      });
  }
}
