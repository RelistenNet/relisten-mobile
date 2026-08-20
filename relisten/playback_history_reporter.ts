import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import Realm from 'realm';
import {
  PlaybackFlags,
  PlaybackHistoryEntry,
} from '@/relisten/realm/models/history/playback_history_entry';
import { log } from '@/relisten/util/logging';
import { randomUUID } from 'expo-crypto';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';
import { Source } from '@/relisten/realm/models/source';
import {
  activePlaybackHistoryEntries,
  activePlaybackHistoryEntryForPrimaryKey,
  readRetainedPlaybackHistoryCatalogLinks,
} from '@/relisten/realm/models/history/playback_history_lifecycle';

const logger = log.extend('playback-history-reporter');

export interface PlaybackHistoryReportable {
  playbackFlags: PlaybackFlags;
  playbackStartedAt: Date;
  sourceTrack: SourceTrack;
}

export class PlaybackHistoryReporter {
  constructor(
    private apiClient: RelistenApiClient,
    private realm: Realm
  ) {}

  private retryTimer: ReturnType<typeof setTimeout> | undefined = undefined;

  private reportTimer: ReturnType<typeof setTimeout> | undefined = undefined;

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
    const sourceTrack = playback.sourceTrack;
    const artist = this.realm.objectForPrimaryKey(Artist, sourceTrack.artistUuid);
    const show = this.realm.objectForPrimaryKey(Show, sourceTrack.showUuid);
    const source = this.realm.objectForPrimaryKey(Source, sourceTrack.sourceUuid);

    if (!artist || !show || !source) {
      logger.warn(
        `Unable to record playback for sourceTrack=${sourceTrack.sourceUuid}. ` +
          `artist=${sourceTrack.artistUuid}, show=${sourceTrack.showUuid}, ` +
          `source=${sourceTrack.sourceUuid}`
      );
      return;
    }

    const catalogLinks = readRetainedPlaybackHistoryCatalogLinks(
      { sourceTrack, artist, show, source },
      'history.recordPlayback'
    );

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
        sourceTrack: catalogLinks.sourceTrack,
        artist: catalogLinks.artist,
        show: catalogLinks.show,
        source: catalogLinks.source,
      });
    });

    // fire and forget report -- async job will pick it up if it doesn't succeed
    if (this.networkAvailable) {
      this.attemptReport(entry.uuid, catalogLinks.sourceTrack.uuid).then(() => {});
    }

    return entry;
  }

  private async attemptReport(
    entryUuid: string,
    sourceTrackUuid: string
  ): Promise<RelistenApiResponse<unknown>> {
    const res = await this.apiClient.recordPlayback(sourceTrackUuid);

    if (!res.error) {
      logger.info(`Reported playback ${entryUuid} for sourceTrack=${sourceTrackUuid}`);
      const entry = activePlaybackHistoryEntryForPrimaryKey(this.realm, entryUuid);

      if (entry) {
        this.realm.write(() => {
          entry.publishedAt = new Date();
        });
      }
    }

    return res;
  }

  private async reportPlaybackHistory() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }

    const entriesToPublish = Array.from(
      activePlaybackHistoryEntries(this.realm).filtered('publishedAt == nil'),
      (entry) => {
        const { sourceTrack } = readRetainedPlaybackHistoryCatalogLinks(
          entry,
          'history.reporting.pending'
        );
        return {
          entryUuid: entry.uuid,
          sourceTrackUuid: sourceTrack.uuid,
        };
      }
    );

    if (entriesToPublish.length === 0) {
      logger.info('No playback history entries to publish');
      return;
    }

    logger.info(`Reporting ${entriesToPublish.length} playback history entries`);

    for (const entry of entriesToPublish) {
      const res = await this.attemptReport(entry.entryUuid, entry.sourceTrackUuid);

      if (res.error) {
        logger.warn(
          `Error reporting ${entry.entryUuid}. Will try again in 30s; ${JSON.stringify(res.error)}`
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
