import {
  MediaPlayerState,
  MediaQueueData,
  MediaQueueItem,
  MediaQueueType,
  MediaRepeatMode,
  RemoteMediaClient,
} from 'react-native-google-cast';
import { RelistenStreamable, RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { PlayerQueueTrack, PlayerRepeatState } from '@/relisten/player/relisten_player_queue';
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
  return track.toStreamable(false);
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

  isActive() {
    return true;
  }

  async play(streamable: RelistenStreamable, queueContext?: PlaybackQueueContext): Promise<void> {
    if (queueContext && queueContext.orderedTracks.length > 0) {
      logger.debug('Loading queue on cast', {
        startIndex: queueContext.startIndex,
        trackCount: queueContext.orderedTracks.length,
        repeatState: queueContext.repeatState,
        shuffleState: queueContext.shuffleState,
      });

      return this.client.loadMedia({
        autoplay: queueContext.autoplay,
        queueData: buildQueueData(queueContext),
      });
    }

    return this.client.loadMedia({
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
  }

  pause(): Promise<void> {
    return this.client.pause();
  }

  resume(): Promise<void> {
    return this.client.play();
  }

  stop(): Promise<void> {
    return this.client.stop();
  }

  async seekTo(pct: number): Promise<void> {
    const status = await this.client.getMediaStatus();
    const duration = status?.mediaInfo?.streamDuration;

    if (!duration || duration <= 0) {
      return Promise.resolve();
    }

    return this.client.seek({ position: duration * pct });
  }

  seekToTime(timeMs: number): Promise<void> {
    return this.client.seek({ position: timeMs / 1000.0 });
  }

  setNextStream() {
    // Cast handles preloading internally via queue preloadTime.
  }
}
