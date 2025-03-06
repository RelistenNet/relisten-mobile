import { SourceTrack } from '@/relisten/realm/models/source_track';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
  SourceTrackOfflineInfoType,
} from '@/relisten/realm/models/source_track_offline_info';
import { realm } from '@/relisten/realm/schema';
import { log } from '@/relisten/util/logging';
import type { DownloadTask } from '@kesha-antonov/react-native-background-downloader';
import RNBackgroundDownloader from '@kesha-antonov/react-native-background-downloader';
import { Realm } from '@realm/react';
import * as fs from 'expo-file-system';

const logger = log.extend('offline');

export class DownloadManager {
  static SHARED_INSTANCE = new DownloadManager();
  static MAX_CONCURRENT_DOWNLOADS = 3;

  private runningDownloadTasks: DownloadTask[] = [];
  private pendingDownloadTasks: number = 0;

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
        throw new Error('Source track already has offline info');
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

    return this.createDownloadTask(sourceTrack, offlineInfo);
  }

  private availableDownloadSlots() {
    return (
      DownloadManager.MAX_CONCURRENT_DOWNLOADS -
      this.runningDownloadTasks.length -
      this.pendingDownloadTasks
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
      const task = await this.createDownloadTask(queuedDownload.sourceTrack, queuedDownload);

      createdTasks.add(task.id);
    }

    logger.debug(`Started createdTasks=${createdTasks.size} new download tasks`);

    return createdTasks;
  }

  private async createDownloadTask(sourceTrack: SourceTrack, offlineInfo: SourceTrackOfflineInfo) {
    logger.debug(
      `creating DownloadTask; sourceTrack.uuid=${sourceTrack.uuid}: mp3Url=${sourceTrack.mp3Url}`
    );

    this.pendingDownloadTasks++;
    const destination = sourceTrack.downloadedFileLocation();

    // make sure the file doesn't already exist. the native code will error out. this should only be needed to recover
    // from strange error states/interactions with the streaming cache
    try {
      await fs.deleteAsync(destination, { idempotent: true });
    } catch {
      /* empty */
    }

    const task = RNBackgroundDownloader.download({
      id: sourceTrack.uuid,
      url: sourceTrack.mp3Url,
      destination,
      isNotificationVisible: true,
    });

    this.pendingDownloadTasks--;
    this.runningDownloadTasks.push(task);

    task.begin(({ expectedBytes }) => {
      realm!.write(() => {
        logger.debug(`${offlineInfo.sourceTrackUuid}: begin`);

        offlineInfo.status = SourceTrackOfflineInfoStatus.Downloading;
        offlineInfo.startedAt = new Date();
        offlineInfo.totalBytes = expectedBytes;
      });
    });

    this.attachDownloadHandlers(realm!, offlineInfo!, task);

    return task;
  }

  async removeAllPendingDownloads() {
    // stop all active downloads
    for (const downloadTask of this.runningDownloadTasks) {
      downloadTask.stop();
      this.runningDownloadTasks.splice(this.runningDownloadTasks.indexOf(downloadTask), 1);
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
      task.stop();
      this.runningDownloadTasks.splice(this.runningDownloadTasks.indexOf(task), 1);
    }

    // delete file, if it exists
    try {
      await fs.deleteAsync(sourceTrack.downloadedFileLocation(), { idempotent: true });
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

    RNBackgroundDownloader.setConfig({
      progressInterval: 500 /* ms */,
      // These are really noisy. If enabled, make sure it is only __DEV__
      isLogsEnabled: false,
    });

    const lostTasks = await RNBackgroundDownloader.checkForExistingDownloads();

    const resumedTaskIds = new Set<string>();

    if (lostTasks.length > 0) {
      for (const task of lostTasks) {
        const offlineInfo = realm.objectForPrimaryKey(SourceTrackOfflineInfo, task.id);

        if (offlineInfo) {
          this.runningDownloadTasks.push(task);
          this.attachDownloadHandlers(realm, offlineInfo, task);
          resumedTaskIds.add(task.id);
        } else {
          task.stop();
        }
      }
    }

    logger.info(`Resumed ${resumedTaskIds.size} background downloads from tasks.`);

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

    realm.write(() => {
      logger.debug(`${downloadTask.id}: progress; ${Math.floor(percent * 100)}`);

      offlineInfo.downloadedBytes = bytesDownloaded;
      offlineInfo.totalBytes = bytesTotal;
      offlineInfo.percent = percent;
    });
  }

  private attachDownloadHandlers(
    realm: Realm,
    offlineInfo: SourceTrackOfflineInfo,
    downloadTask: DownloadTask
  ) {
    downloadTask
      .progress((props) => {
        this.writeProgress(realm, offlineInfo, downloadTask, props);
      })
      .done(() => {
        realm.write(() => {
          logger.debug(`${downloadTask.id}: done`);
          offlineInfo.status = SourceTrackOfflineInfoStatus.Succeeded;
          offlineInfo.completedAt = new Date();
          offlineInfo.downloadedBytes = offlineInfo.totalBytes;
          offlineInfo.percent = 1.0;
          offlineInfo.errorInfo = undefined;
        });

        this.runningDownloadTasks.splice(this.runningDownloadTasks.indexOf(downloadTask), 1);
        this.maybeStartQueuedDownloads().then(() => {});
      })
      .error((error) => {
        realm.write(() => {
          logger.debug(`${downloadTask.id}: error; ${JSON.stringify(error)}`);

          offlineInfo.status = SourceTrackOfflineInfoStatus.Failed;
          offlineInfo.completedAt = new Date();
          offlineInfo.errorInfo = JSON.stringify(error);
        });

        this.runningDownloadTasks.splice(this.runningDownloadTasks.indexOf(downloadTask), 1);
        this.maybeStartQueuedDownloads().then(() => {});
      });
  }
}
