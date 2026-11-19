import type { RelistenApiClient } from '@/relisten/api/client';
import Realm from 'realm';
import type { AuthorizedAccountsApiClient } from '@/relisten/accounts/api/accounts_api_client';
import type { AccountScopeSource } from '@/relisten/accounts/account_scope_store';
import {
  PlaybackFlags,
  PlaybackHistoryEntry,
} from '@/relisten/realm/models/history/playback_history_entry';
import { log } from '@/relisten/util/logging';
import { randomUUID } from 'expo-crypto';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import type { Artist } from '@/relisten/realm/models/artist';
import type { Show } from '@/relisten/realm/models/show';
import type { Source } from '@/relisten/realm/models/source';
import { createUuidV7TypedId } from '@/relisten/util/typed_uuid_id';
import {
  MAX_PLAYS_PER_BATCH,
  type PlayBatchResponse,
  playUploadOf,
} from '@/relisten/history/cloud_play_upload';

const logger = log.extend('playback-history-reporter');

const RETRY_DELAY_MS = 30 * 1000;

export interface PlaybackHistoryReportable {
  playbackFlags: PlaybackFlags;
  playbackStartedAt: Date;
  sourceTrack: SourceTrack;
  /** Set when the track was queued from a playlist. */
  playlistContext?: { playlistId: string; entryId: string };
}

/** The signed-in account plays are saved to, if any. */
export interface PlayHistoryAccounts {
  scopes: AccountScopeSource;
  api: AuthorizedAccountsApiClient;
}

/**
 * Records plays on the device and reports them. A play recorded while signed
 * in belongs to that account and is uploaded to it, in order, only while it is
 * the signed-in account; the account also counts it toward popularity. A play
 * recorded signed out is reported anonymously to `/live/play`, as before
 * accounts. Rows wait on the device until their destination has them, and a
 * failed send is retried after 30 seconds.
 */
export class PlaybackHistoryReporter {
  constructor(
    private apiClient: RelistenApiClient,
    private realm: Realm,
    private accounts?: PlayHistoryAccounts,
    private platform = 'ios'
  ) {}

  private retryTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  private reportTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  private networkAvailable = false;
  private reporting = false;
  private reportAgain = false;

  onNetworkAvailable() {
    clearTimeout(this.reportTimer);
    // Up to 15 seconds of jitter so devices coming online together don't stampede.
    this.reportTimer = setTimeout(() => void this.report(), Math.random() * 15 * 1000);
    this.networkAvailable = true;
  }

  onNetworkUnavailable() {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.networkAvailable = false;
  }

  /** The signed-in account changed: its waiting plays can go now. */
  onAccountChanged() {
    if (this.networkAvailable) {
      void this.report();
    }
  }

  recordPlayback(playback: PlaybackHistoryReportable): PlaybackHistoryEntry | undefined {
    const { sourceTrack } = playback;
    // By model name, so this file doesn't load the catalog classes (and their imports).
    const artist = this.realm.objectForPrimaryKey<Artist>('Artist', sourceTrack.artistUuid);
    const show = this.realm.objectForPrimaryKey<Show>('Show', sourceTrack.showUuid);
    const source = this.realm.objectForPrimaryKey<Source>('Source', sourceTrack.sourceUuid);

    if (!artist || !show || !source) {
      logger.warn(
        `Unable to record playback for sourceTrack=${sourceTrack.sourceUuid}. ` +
          `artist=${sourceTrack.artistUuid}, show=${sourceTrack.showUuid}, ` +
          `source=${sourceTrack.sourceUuid}`
      );
      return;
    }

    // The destination is fixed now; signing in or out later doesn't move the play.
    const capture = this.accounts?.scopes.capture();
    const userId = capture?.isAuthenticated ? (capture.userId ?? undefined) : undefined;
    const entry = this.realm.write(
      () =>
        new PlaybackHistoryEntry(this.realm, {
          uuid: randomUUID(),
          publishedAt: undefined,
          createdAt: new Date(),
          playbackFlags:
            playback.playbackFlags |
            (this.networkAvailable
              ? PlaybackFlags.NetworkAvailable
              : PlaybackFlags.NetworkUnavailable),
          playbackStartedAt: playback.playbackStartedAt,
          sourceTrack,
          artist,
          show,
          source,
          destinationUserId: userId,
          playId: userId ? createUuidV7TypedId('play') : undefined,
          playlistId: playback.playlistContext?.playlistId,
          playlistEntryId: playback.playlistContext?.entryId,
          catalogDurationMs:
            sourceTrack.duration && sourceTrack.duration > 0
              ? Math.round(sourceTrack.duration * 1000)
              : undefined,
        })
    );

    if (this.networkAvailable) {
      void this.report();
    }
    return entry;
  }

  /** Sends every play waiting for a destination that can take it now. One run at a time. */
  async report() {
    if (this.reporting) {
      this.reportAgain = true;
      return;
    }
    this.reporting = true;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;

    try {
      do {
        this.reportAgain = false;
        await this.uploadAccountPlays();
        await this.reportAnonymousPlays();
      } while (this.reportAgain);
    } catch (error) {
      logger.warn(
        `Reporting plays failed; retrying in 30s: ${error instanceof Error ? error.message : error}`
      );
      this.retryTimer = setTimeout(() => void this.report(), RETRY_DELAY_MS);
    } finally {
      this.reporting = false;
    }
  }

  /** Uploads the signed-in account's waiting plays, oldest first, in bounded batches. */
  private async uploadAccountPlays() {
    if (!this.accounts) {
      return;
    }
    const { scopes, api } = this.accounts;
    const capture = scopes.capture();
    if (!capture.isAuthenticated || !capture.userId) {
      return;
    }

    for (;;) {
      const batch = this.realm
        .objects(PlaybackHistoryEntry)
        .filtered('publishedAt == null AND destinationUserId == $0', capture.userId)
        .sorted('createdAt')
        .slice(0, MAX_PLAYS_PER_BATCH);
      if (batch.length === 0) {
        return;
      }
      const rowIds = batch.map((entry) => entry.uuid);
      const plays = batch.map((entry) => playUploadOf(entry, this.platform));

      const response = await api.request<PlayBatchResponse>('/v1/history/plays:batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_version: 1, plays }),
      });
      // A response for an account that is no longer signed in writes nothing.
      if (!scopes.isCurrent(capture)) {
        return;
      }
      if (response?.results?.length !== plays.length) {
        throw new Error('The play upload response has no result for every play.');
      }

      // Every result status means the account is done with that play.
      this.markPublished(rowIds);
    }
  }

  /** Reports plays recorded signed out, one at a time, as before accounts. */
  private async reportAnonymousPlays() {
    const waiting = this.realm
      .objects(PlaybackHistoryEntry)
      .filtered('publishedAt == null AND destinationUserId == null')
      .sorted('createdAt')
      .map((entry) => ({ uuid: entry.uuid, trackUuid: entry.sourceTrack.uuid }));

    for (const { uuid, trackUuid } of waiting) {
      // History can be cleared while a request is out; a removed row is skipped.
      if (!this.realm.objectForPrimaryKey(PlaybackHistoryEntry, uuid)) {
        continue;
      }
      const response = await this.apiClient.recordPlayback(trackUuid);
      if (response.error) {
        throw new Error(`Reporting play ${uuid} failed.`);
      }
      this.markPublished([uuid]);
    }
  }

  private markPublished(rowIds: string[]) {
    const now = new Date();
    this.realm.write(() => {
      for (const id of rowIds) {
        const entry = this.realm.objectForPrimaryKey(PlaybackHistoryEntry, id);
        if (entry) {
          entry.publishedAt = now;
        }
      }
    });
  }
}
