import {
  default as GoogleCast,
  MediaPlayerState,
  MediaQueueData,
  MediaQueueItem,
  MediaQueueType,
  MediaRepeatMode,
  RemoteMediaClient,
} from 'react-native-google-cast';
import { RelistenStreamable, RelistenPlaybackState } from '@/modules/relisten-audio-player';
import {
  PlayerQueueTrack,
  PlayerRepeatState,
  PlayerShuffleState,
} from '@/relisten/player/relisten_player_queue';
import { PlaybackDriver, PlaybackQueueContext } from '@/relisten/player/playback_driver';
import { log } from '@/relisten/util/logging';

const logger = log.extend('cast-driver');

const DEFAULT_CONTENT_TYPE = 'audio/mpeg';

export function mapRepeatState(repeatState: PlayerRepeatState) {
  switch (repeatState) {
    case PlayerRepeatState.REPEAT_TRACK:
      return MediaRepeatMode.SINGLE;
    case PlayerRepeatState.REPEAT_QUEUE:
      return MediaRepeatMode.ALL;
    default:
      return MediaRepeatMode.OFF;
  }
}

export function mapMediaPlayerState(playerState: MediaPlayerState | null | undefined) {
  switch (playerState) {
    case MediaPlayerState.PAUSED:
      return RelistenPlaybackState.Paused;
    case MediaPlayerState.PLAYING:
      return RelistenPlaybackState.Playing;
    case MediaPlayerState.BUFFERING:
      return RelistenPlaybackState.Stalled;
    case MediaPlayerState.IDLE:
    default:
      return RelistenPlaybackState.Stopped;
  }
}

function buildStreamable(track: PlayerQueueTrack) {
  // Force streaming URLs for Cast (offline file URLs are local-only).
  return track.toStreamable(false, { forceStreaming: true });
}

function buildQueueItems(tracks: PlayerQueueTrack[]): MediaQueueItem[] {
  return tracks.map((track) => {
    const streamable = buildStreamable(track);

    return {
      autoplay: true,
      preloadTime: 20,
      mediaInfo: {
        contentUrl: streamable.url,
        contentType: DEFAULT_CONTENT_TYPE,
        metadata: {
          type: 'musicTrack',
          title: streamable.title,
          artist: streamable.artist,
          albumTitle: streamable.albumTitle,
          images: streamable.albumArt ? [{ url: streamable.albumArt }] : [],
        },
        customData: {
          identifier: streamable.identifier,
          sourceTrackUuid: track.sourceTrack.uuid,
        },
      },
    };
  });
}

export function buildQueueData(queueContext: PlaybackQueueContext): MediaQueueData {
  return {
    items: buildQueueItems(queueContext.orderedTracks),
    type: MediaQueueType.PLAYLIST,
    repeatMode: mapRepeatState(queueContext.repeatState),
    startIndex: queueContext.startIndex,
    startTime: queueContext.startTimeMs ? queueContext.startTimeMs / 1000.0 : undefined,
  };
}

export class CastPlaybackDriver implements PlaybackDriver {
  name = 'cast';

  constructor(private client: RemoteMediaClient) {}

  private async handleCastError(action: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldEndSession =
      message.includes('No media session is available') ||
      message.includes('Channel is not connected') ||
      message.includes('Cocoa error 32');

    if (shouldEndSession) {
      logger.warn(`Cast ${action} failed; ending session`, message);
      await GoogleCast.getSessionManager()
        .endCurrentSession(false)
        .catch(() => {});
      return;
    }

    logger.warn(`Cast ${action} failed`, error);
  }

  isActive() {
    return true;
  }

  async play(streamable: RelistenStreamable, queueContext?: PlaybackQueueContext): Promise<void> {
    try {
      if (queueContext && queueContext.orderedTracks.length > 0) {
        const normalizedQueueContext: PlaybackQueueContext = {
          ...queueContext,
          repeatState: PlayerRepeatState.REPEAT_OFF,
          shuffleState: PlayerShuffleState.SHUFFLE_OFF,
        };
        logger.debug('Loading queue on cast', {
          startIndex: normalizedQueueContext.startIndex,
          trackCount: normalizedQueueContext.orderedTracks.length,
          repeatState: normalizedQueueContext.repeatState,
          shuffleState: normalizedQueueContext.shuffleState,
        });

        await this.client.loadMedia({
          autoplay: normalizedQueueContext.autoplay,
          queueData: buildQueueData(normalizedQueueContext),
        });
        return;
      }

      await this.client.loadMedia({
        autoplay: queueContext?.autoplay ?? true,
        startTime: queueContext?.startTimeMs ? queueContext.startTimeMs / 1000.0 : undefined,
        mediaInfo: {
          contentUrl: streamable.url,
          contentType: DEFAULT_CONTENT_TYPE,
          metadata: {
            type: 'musicTrack',
            title: streamable.title,
            artist: streamable.artist,
            albumTitle: streamable.albumTitle,
            images: streamable.albumArt ? [{ url: streamable.albumArt }] : [],
          },
          customData: {
            identifier: streamable.identifier,
          },
        },
      });
    } catch (error) {
      await this.handleCastError('play', error);
    }
  }

  async pause(): Promise<void> {
    try {
      await this.client.pause();
    } catch (error) {
      await this.handleCastError('pause', error);
    }
  }

  async resume(): Promise<void> {
    try {
      await this.client.play();
    } catch (error) {
      await this.handleCastError('resume', error);
    }
  }

  async stop(): Promise<void> {
    try {
      await this.client.stop();
    } catch (error) {
      await this.handleCastError('stop', error);
    }
  }

  async seekTo(pct: number): Promise<void> {
    try {
      const status = await this.client.getMediaStatus();
      const duration = status?.mediaInfo?.streamDuration;

      if (!duration || duration <= 0) {
        return;
      }

      await this.client.seek({ position: duration * pct });
    } catch (error) {
      await this.handleCastError('seek', error);
    }
  }

  async seekToTime(timeMs: number): Promise<void> {
    try {
      await this.client.seek({ position: timeMs / 1000.0 });
    } catch (error) {
      await this.handleCastError('seek', error);
    }
  }

  setNextStream() {
    // Cast handles preloading internally via queue preloadTime.
  }
}
