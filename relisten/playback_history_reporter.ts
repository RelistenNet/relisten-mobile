import type { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
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

    // fire and forget report -- async job will pick it up if it doesn't succeed
    if (this.networkAvailable) {
      this.attemptReport(entry.uuid).then(() => {});
    }

    return entry;
  }

  private async attemptReport(
    entryUuid: string
  ): Promise<RelistenApiResponse<unknown> | undefined> {
    const entry = this.realm.objectForPrimaryKey(PlaybackHistoryEntry, entryUuid);
    if (!entry) {
      return;
    }

    // History rows are physical leaves and may be cleared while the request is in flight.
    const sourceTrackUuid = entry.sourceTrack.uuid;
    const res = await this.apiClient.recordPlayback(sourceTrackUuid);

    if (!res.error) {
      logger.info(`Reported playback ${entryUuid} for sourceTrack=${sourceTrackUuid}`);
      const currentEntry = this.realm.objectForPrimaryKey(PlaybackHistoryEntry, entryUuid);
      if (currentEntry) {
        this.realm.write(() => {
          currentEntry.publishedAt = new Date();
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

    const entriesToPublish = this.realm
      .objects(PlaybackHistoryEntry)
      .filtered('publishedAt == null');

    if (entriesToPublish.length === 0) {
      logger.info('No playback history entries to publish');
      return;
    }

    const entryUuidsToPublish = Array.from(entriesToPublish, (entry) => entry.uuid);
    logger.info(`Reporting ${entryUuidsToPublish.length} playback history entries`);

    for (const entryUuid of entryUuidsToPublish) {
      const res = await this.attemptReport(entryUuid);

      if (res?.error) {
        logger.warn(
          `Error reporting ${entryUuid}. Will try again in 30s; ${JSON.stringify(res.error)}`
        );

        this.retryTimer = setTimeout(() => {
          this.reportPlaybackHistory();
        }, 30 * 1000);

        return;
      }
    }

    logger.info(`Successfully processed ${entryUuidsToPublish.length} playback history entries`);
  }
}
