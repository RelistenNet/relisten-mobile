import { StatsigEvent } from '@statsig/client-core/src/StatsigEvent';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { StatsigClientExpo } from '@statsig/expo-bindings';
import { SourceTrackOfflineInfo } from '@/relisten/realm/models/source_track_offline_info';

export const STATSIG_CLIENT_KEY = 'client-b2bL7VM28cjEBr7aVFNv8wOqa1STKtLyXD5MoCxA94f';

let _statsig: StatsigClientExpo | undefined = undefined;

export function sharedStatsigClient() {
  if (!_statsig) {
    _statsig = new StatsigClientExpo(STATSIG_CLIENT_KEY, {});
  }

  return _statsig;
}

export enum Events {
  TrackPlayback = 'track_playback',
  TrackDownloadQueued = 'track_download_queued',
  TrackDownloadCompleted = 'track_download_completed',
  TrackDownloadFailure = 'track_download_failure',
  DownloadsResumed = 'downloads_resumed',
}

export function trackPlaybackEvent(sourceTrack: SourceTrack): StatsigEvent {
  return {
    eventName: Events.TrackPlayback,
    value: sourceTrack.uuid,
    metadata: {
      showUuid: sourceTrack.showUuid,
      artistUuid: sourceTrack.artistUuid,
    },
  };
}

export function trackDownloadQueuedEvent(sourceTrack: SourceTrack): StatsigEvent {
  return {
    eventName: Events.TrackDownloadQueued,
    value: sourceTrack.uuid,
    metadata: {
      showUuid: sourceTrack.showUuid,
      artistUuid: sourceTrack.artistUuid,
      url: sourceTrack.mp3Url,
    },
  };
}

export function trackDownloadCompletedEvent(sourceTrack: SourceTrack): StatsigEvent {
  return {
    eventName: Events.TrackDownloadCompleted,
    value: sourceTrack.uuid,
    metadata: {
      showUuid: sourceTrack.showUuid,
      artistUuid: sourceTrack.artistUuid,
      url: sourceTrack.mp3Url,
    },
  };
}

export function trackDownloadFailureEvent(
  sourceTrack: SourceTrack,
  offlineInfo: SourceTrackOfflineInfo
): StatsigEvent {
  return {
    eventName: Events.TrackDownloadFailure,
    value: sourceTrack.uuid,
    metadata: {
      showUuid: sourceTrack.showUuid,
      artistUuid: sourceTrack.artistUuid,
      url: sourceTrack.mp3Url,
      errorInfo: offlineInfo?.errorInfo,
    },
  };
}

export function downloadsResumedEvent(downloadsResumedCount: number): StatsigEvent {
  return {
    eventName: Events.DownloadsResumed,
    value: downloadsResumedCount,
  };
}
