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

  private runningDownloadTasks: DownloadTask[] = [];

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

    await this.createDownloadTask(sourceTrack, offlineInfo!);
  }

  markCachedFileAsAvailableOffline(sourceTrack: SourceTrack, totalBytes: number) {
    if (!realm) {
      logger.error('markCachedFileAsOffline: No global Realm instance available.');
      return;
    }

    realm.write(() => {
      const d = new Date();

      const offlineInfo = new SourceTrackOfflineInfo(realm!, {
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
      sourceTrack.show.hasOfflineTracks = true;
    });
  }

  private async createDownloadTask(sourceTrack: SourceTrack, offlineInfo: SourceTrackOfflineInfo) {
    logger.debug(`${sourceTrack.uuid}: ${sourceTrack.mp3Url}`);

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

        if (!sourceTrack.show._hasOfflineTracks) {
          sourceTrack.show.hasOfflineTracks = false;
        }
      });
    }
  }

  async resumeExistingDownloads() {
    if (!realm) {
      logger.error('downloadTrack: No global Realm instance available.');
      return;
    }

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

    const queuedDownloads = realm
      .objects(SourceTrackOfflineInfo)
      .filtered('status == $0', SourceTrackOfflineInfoStatus.Queued);

    const restartedTaskIds = new Set<string>();

    for (const offlineInfo of queuedDownloads) {
      if (!resumedTaskIds.has(offlineInfo.sourceTrackUuid)) {
        const task = await this.createDownloadTask(offlineInfo.sourceTrack, offlineInfo);

        restartedTaskIds.add(task.id);
      }
    }

    logger.info(`Restarted ${restartedTaskIds.size} downloads from orphaned offline info.`);
  }

  private downloadTaskById(id: string) {
    for (const task of this.runningDownloadTasks) {
      if (task.id === id) {
        return task;
      }
    }
  }

  private attachDownloadHandlers(
    realm: Realm,
    offlineInfo: SourceTrackOfflineInfo,
    downloadTask: DownloadTask
  ) {
    downloadTask
      .progress(({ bytesDownloaded, bytesTotal }) => {
        const percent = bytesDownloaded / bytesTotal;

        realm.write(() => {
          logger.debug(`${downloadTask.id}: progress; ${percent}`);

          offlineInfo.downloadedBytes = bytesDownloaded;
          offlineInfo.totalBytes = bytesTotal;
          offlineInfo.percent = percent;
        });
      })
      .done(() => {
        realm.write(() => {
          logger.debug(`${downloadTask.id}: done`);

          offlineInfo.status = SourceTrackOfflineInfoStatus.Succeeded;
          offlineInfo.completedAt = new Date();
          offlineInfo.errorInfo = undefined;

          offlineInfo.sourceTrack.show.hasOfflineTracks = true;
        });

        this.runningDownloadTasks.splice(this.runningDownloadTasks.indexOf(downloadTask), 1);
      })
      .error((error) => {
        realm.write(() => {
          logger.debug(`${downloadTask.id}: error; ${JSON.stringify(error)}`);

          offlineInfo.status = SourceTrackOfflineInfoStatus.Failed;
          offlineInfo.completedAt = new Date();
          offlineInfo.errorInfo = JSON.stringify(error);
        });

        this.runningDownloadTasks.splice(this.runningDownloadTasks.indexOf(downloadTask), 1);
      });
  }
}
