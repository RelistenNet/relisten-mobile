import { log } from '@/relisten/util/logging';
import {
  LastFmClient,
  LastFmApiError,
  LastFmScrobbleParams,
} from '@/relisten/lastfm/lastfm_client';
import { LastFmSecrets } from '@/relisten/lastfm/lastfm_secrets';
import { LastFmScrobbleQueue } from '@/relisten/lastfm/lastfm_scrobble_queue';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import { RelistenPlayerReportTrackEvent } from '@/relisten/player/relisten_player';
import { LastFmSettings } from '@/relisten/realm/models/lastfm_settings';
import { Realm } from '@realm/react';

const logger = log.extend('lastfm-service');

const NOW_PLAYING_DEBOUNCE_MS = 30_000;
const AUTH_ERROR_CODES = new Set([4, 9, 14, 15]);

export class LastFmService {
  private client: LastFmClient | undefined;
  private queue: LastFmScrobbleQueue;
  private isConnected = true;
  private isFlushing = false;
  private lastNowPlayingId: string | undefined;
  private lastNowPlayingAt: number | undefined;

  constructor(private readonly realm: Realm) {
    this.client = LastFmClient.fromEnv();
    this.queue = new LastFmScrobbleQueue(realm);
  }

  setConnectivity(isConnected: boolean) {
    this.isConnected = isConnected;
  }

  clearQueue() {
    this.queue.clearAll();
  }

  async handleTrackStart(track: PlayerQueueTrack, settings: LastFmSettings) {
    if (!this.isReady(settings)) {
      return;
    }

    if (!this.client) {
      return;
    }

    if (!this.isConnected) {
      return;
    }

    const artistName = this.getArtistName(track);

    if (!artistName || !this.hasRequiredMetadata(track)) {
      return;
    }

    const now = Date.now();
    if (this.lastNowPlayingId === track.identifier && this.lastNowPlayingAt) {
      if (now - this.lastNowPlayingAt < NOW_PLAYING_DEBOUNCE_MS) {
        return;
      }
    }

    const sessionKey = await LastFmSecrets.getSessionKey();

    if (!sessionKey) {
      return;
    }

    try {
      await this.client.updateNowPlaying(sessionKey, {
        artist: artistName,
        track: track.title,
        album: this.getAlbumName(track),
        duration: track.sourceTrack.duration,
      });
      this.lastNowPlayingId = track.identifier;
      this.lastNowPlayingAt = now;
    } catch (error) {
      this.handleAuthError(error);
    }
  }

  async handleScrobbleEvent(event: RelistenPlayerReportTrackEvent, settings: LastFmSettings) {
    if (!this.client) {
      return;
    }

    if (!settings.enabledWithDefault()) {
      return;
    }

    const artistName = this.getArtistName(event.playerQueueTrack);

    if (!artistName || !this.hasRequiredMetadata(event.playerQueueTrack)) {
      return;
    }

    const sessionKey = await LastFmSecrets.getSessionKey();

    if (!sessionKey) {
      return;
    }

    const payload: LastFmScrobbleParams = {
      artist: artistName,
      track: event.playerQueueTrack.title,
      album: this.getAlbumName(event.playerQueueTrack),
      duration: event.playerQueueTrack.sourceTrack.duration,
      timestamp: event.playbackStartedAt,
    };

    if (!this.isConnected || settings.authInvalidWithDefault()) {
      this.queue.enqueue(payload);
      return;
    }

    try {
      await this.client.scrobble(sessionKey, payload);
    } catch (error) {
      if (this.handleAuthError(error)) {
        this.queue.enqueue(payload);
        return;
      }

      logger.warn('Failed to scrobble, enqueueing', error);
      this.queue.enqueue(payload);
    }
  }

  async flushQueue(settings: LastFmSettings) {
    if (!this.isReady(settings)) {
      return;
    }

    if (!this.client || !this.isConnected) {
      return;
    }

    if (this.isFlushing) {
      return;
    }

    const sessionKey = await LastFmSecrets.getSessionKey();

    if (!sessionKey) {
      return;
    }

    this.isFlushing = true;

    try {
      const entries = this.queue.list();

      for (const entry of entries) {
        const payload: LastFmScrobbleParams = {
          artist: entry.artist,
          track: entry.track,
          album: entry.album,
          duration: entry.duration,
          timestamp: entry.timestamp,
        };

        try {
          await this.client.scrobble(sessionKey, payload);
          this.queue.markAttempt(entry.id, true);
        } catch (error) {
          if (this.handleAuthError(error)) {
            this.queue.markAttempt(entry.id, false);
            break;
          }

          logger.warn('Failed to flush scrobble queue', error);
          this.queue.markAttempt(entry.id, false);
          break;
        }
      }
    } finally {
      this.isFlushing = false;
    }
  }

  private isReady(settings: LastFmSettings) {
    if (!this.client) {
      return false;
    }

    if (!settings.enabledWithDefault()) {
      return false;
    }

    if (settings.authInvalidWithDefault()) {
      return false;
    }

    return true;
  }

  private hasRequiredMetadata(track: PlayerQueueTrack) {
    return track.title.trim().length > 0;
  }

  private getArtistName(track: PlayerQueueTrack) {
    return track.sourceTrack.artist?.name?.trim() || track.artist.trim();
  }

  private getAlbumName(track: PlayerQueueTrack) {
    const album = track.albumTitle?.trim();
    return album && album.length > 0 ? album : undefined;
  }

  private handleAuthError(error: unknown) {
    if (!(error instanceof LastFmApiError)) {
      return false;
    }

    if (!AUTH_ERROR_CODES.has(error.code)) {
      return false;
    }

    logger.warn('Last.fm auth error, disabling scrobbling', error);

    LastFmSettings.upsert(this.realm, {
      authInvalid: true,
    });

    return true;
  }
}
