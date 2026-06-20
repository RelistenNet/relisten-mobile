import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import Realm from 'realm';
import {
  PlaybackFlags,
  PlaybackHistoryEntry,
} from '@/relisten/realm/models/history/playback_history_entry';
import { log } from '@/relisten/util/logging';
import { randomUUID } from 'expo-crypto';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';
import { Source } from '@/relisten/realm/models/source';
import { QueueV2Item } from '@/relisten/player/queue_v2';
import { recordAuthenticatedPlaybackHistoryEvent } from '@/relisten/user_library/playback_history_recording';

const logger = log.extend('playback-history-reporter');

export interface PlaybackHistoryReportable {
  playbackFlags: PlaybackFlags;
  playbackStartedAt: Date;
  sourceTrack: SourceTrack;
  queueV2Item?: QueueV2Item;
}

export class PlaybackHistoryReporter {
  constructor(
    private apiClient: RelistenApiClient,
    private realm: Realm
  ) {}

  private retryTimer: NodeJS.Timeout | undefined = undefined;

  private reportTimer: NodeJS.Timeout | undefined = undefined;

  private networkAvailable = false;

  onNetworkAvailable() {
    if (this.reportTimer) {
      clearTimeout(this.reportTimer);
      this.reportTimer = undefined;
    }

    // 15 seconds of jitter to prevent things stampeding when network is available
    this.reportTimer = setTimeout(
      () => {
        this.reportPlaybackHistory().then(() => {});
      },
      Math.random() * 15 * 1000
    );

    this.networkAvailable = true;
  }

  onNetworkUnavailable() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }

    this.networkAvailable = false;
  }

  recordPlayback(playback: PlaybackHistoryReportable): PlaybackHistoryEntry | undefined {
    const artist = this.realm.objectForPrimaryKey(Artist, playback.sourceTrack.artistUuid);
    const show = this.realm.objectForPrimaryKey(Show, playback.sourceTrack.showUuid);
    const source = this.realm.objectForPrimaryKey(Source, playback.sourceTrack.sourceUuid);

    if (!artist || !show || !source) {
      logger.warn(
        `Unable to record playback for sourceTrack=${playback.sourceTrack.sourceUuid}. ` +
          `artist=${playback.sourceTrack.artistUuid}, show=${playback.sourceTrack.showUuid}, ` +
          `source=${playback.sourceTrack.sourceUuid}`
      );
      return;
    }

    const entry = this.realm.write(() => {
      return new PlaybackHistoryEntry(this.realm, {
        uuid: randomUUID(),
        publishedAt: undefined,
        createdAt: new Date(),
        playbackFlags:
          playback.playbackFlags |
          (this.networkAvailable
            ? PlaybackFlags.NetworkAvailable
            : PlaybackFlags.NetworkUnavailable),
        playbackStartedAt: playback.playbackStartedAt,
        sourceTrack: playback.sourceTrack,
        artist: artist,
        show: show,
        source: source,
      });
    });

    // Legacy catalog history stays in place during the user-library rollout; the
    // scoped journal below is the authenticated upload path. Keep both writes so
    // existing recently-played behavior does not depend on account sync.
    if (this.networkAvailable) {
      this.attemptReport(entry).then(() => {});
    }

    this.recordAuthenticatedPlayback(entry, playback);
    return entry;
  }

  private recordAuthenticatedPlayback(
    entry: PlaybackHistoryEntry,
    playback: PlaybackHistoryReportable
  ) {
    try {
      recordAuthenticatedPlaybackHistoryEvent(this.realm, {
        clientEventUuid: entry.uuid,
        sourceTrackUuid: playback.sourceTrack.uuid,
        sourceUuid: playback.sourceTrack.sourceUuid,
        showUuid: playback.sourceTrack.showUuid,
        artistUuid: playback.sourceTrack.artistUuid,
        queueV2Item: playback.queueV2Item,
        playedAt: playback.playbackStartedAt,
        playbackFlags: entry.playbackFlags,
        platform: Platform.OS,
        appVersion: currentAppVersion(),
      });
    } catch (error) {
      logger.warn(
        `Unable to record scoped playback history ${entry.uuid}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async attemptReport(entry: PlaybackHistoryEntry): Promise<RelistenApiResponse<unknown>> {
    const res = await this.apiClient.recordPlayback(entry.sourceTrack.uuid);

    if (!res.error) {
      logger.info(`Reported playback ${entry.uuid} for sourceTrack=${entry.sourceTrack.uuid}`);
      this.realm.write(() => {
        entry.publishedAt = new Date();
      });
    }

    return res;
  }

  private async reportPlaybackHistory() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }

    const entriesToPublish = this.realm
      .objects(PlaybackHistoryEntry)
      .filtered('publishedAt == null');

    if (entriesToPublish.length === 0) {
      logger.info('No playback history entries to publish');
      return;
    }

    logger.info(`Reporting ${entriesToPublish.length} playback history entries`);

    for (const entry of entriesToPublish) {
      const res = await this.attemptReport(entry);

      if (res.error) {
        logger.warn(
          `Error reporting ${entry.uuid}. Will try again in 30s; ${JSON.stringify(res.error)}`
        );

        this.retryTimer = setTimeout(() => {
          this.reportPlaybackHistory();
        }, 30 * 1000);

        return;
      }
    }

    logger.info(`Successfully reported ${entriesToPublish.length} playback history entries`);
  }
}

function currentAppVersion() {
  return (
    [Application.nativeApplicationVersion, Application.nativeBuildVersion]
      .filter((part) => !!part)
      .join(' ') || 'unknown'
  );
}
