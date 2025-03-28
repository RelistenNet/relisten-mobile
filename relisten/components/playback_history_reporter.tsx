import { useRelistenReportTrackEvent } from '@/relisten/player/relisten_player_hooks';
import { useEffect, useState } from 'react';
import { useRelistenApi } from '@/relisten/api/context';
import { PlaybackFlags } from '@/relisten/realm/models/history/playback_history_entry';
import { RelistenPlayerReportTrackEvent } from '@/relisten/player/relisten_player';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { TrackListeningHistorySetting } from '@/relisten/realm/models/user_settings';
import { sharedStatsigClient, trackPlaybackEvent } from '@/relisten/events';

export function PlaybackHistoryReporterComponent() {
  const { playbackHistoryReporter } = useRelistenApi();
  const reportTrackEvent = useRelistenReportTrackEvent();
  const userSettings = useUserSettings();

  // Used to prevent double reporting when playbackHistoryReporter changes
  const [lastReportedEvent, setLastReportedEvent] = useState<
    RelistenPlayerReportTrackEvent | undefined
  >();

  useEffect(() => {
    if (reportTrackEvent && reportTrackEvent !== lastReportedEvent) {
      setLastReportedEvent(reportTrackEvent);

      sharedStatsigClient().logEvent(
        trackPlaybackEvent(reportTrackEvent.playerQueueTrack.sourceTrack)
      );

      if (userSettings.trackListeningHistoryWithDefault() === TrackListeningHistorySetting.Always) {
        playbackHistoryReporter.recordPlayback({
          playbackFlags:
            reportTrackEvent.playerQueueTrack.sourceTrack.offlineInfo?.isPlayableOffline()
              ? PlaybackFlags.Offline
              : PlaybackFlags.Online,
          playbackStartedAt: reportTrackEvent.playbackStartedAt,
          sourceTrack: reportTrackEvent.playerQueueTrack.sourceTrack,
        });
      }
    }
  }, [playbackHistoryReporter, reportTrackEvent, lastReportedEvent, setLastReportedEvent]);

  return <></>;
}
