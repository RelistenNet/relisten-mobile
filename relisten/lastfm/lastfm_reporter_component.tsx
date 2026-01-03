import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useRealm } from '@/relisten/realm/schema';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import {
  useRelistenPlayerPlaybackState,
  useRelistenReportTrackEvent,
} from '@/relisten/player/relisten_player_hooks';
import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { LastFmService } from '@/relisten/lastfm/lastfm_service';
import { useLastFmSettings } from '@/relisten/realm/models/lastfm_settings_repo';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

function useLastFmService() {
  const realm = useRealm();
  const serviceRef = useRef<LastFmService | null>(null);

  useEffect(() => {
    if (!realm || serviceRef.current) {
      return;
    }

    serviceRef.current = new LastFmService(realm);
  }, [realm]);

  return serviceRef;
}

function useLastFmConnectivity(serviceRef: React.MutableRefObject<LastFmService | null>) {
  const shouldMakeNetworkRequests = useShouldMakeNetworkRequests();
  const settings = useLastFmSettings();
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!serviceRef.current) {
      return;
    }

    serviceRef.current.setConnectivity(shouldMakeNetworkRequests);

    if (shouldMakeNetworkRequests) {
      serviceRef.current.flushQueue(settingsRef.current);
    }
  }, [shouldMakeNetworkRequests, serviceRef]);

  useEffect(() => {
    if (!serviceRef.current) {
      return;
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        serviceRef.current?.flushQueue(settingsRef.current);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [serviceRef]);

  return settings;
}

export function LastFmReporterComponent() {
  const currentTrack = useRelistenPlayerCurrentTrack();
  const reportTrackEvent = useRelistenReportTrackEvent();
  const playbackState = useRelistenPlayerPlaybackState();
  const serviceRef = useLastFmService();
  const settings = useLastFmConnectivity(serviceRef);
  const [lastScrobbleEvent, setLastScrobbleEvent] = useState(reportTrackEvent);
  const lastNowPlayingIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!serviceRef.current || !currentTrack || playbackState !== RelistenPlaybackState.Playing) {
      return;
    }

    if (lastNowPlayingIdRef.current === currentTrack.identifier) {
      return;
    }

    lastNowPlayingIdRef.current = currentTrack.identifier;
    serviceRef.current.handleTrackStart(currentTrack, settings);
  }, [currentTrack, playbackState, settings]);

  useEffect(() => {
    if (!serviceRef.current || !reportTrackEvent) {
      return;
    }

    if (reportTrackEvent !== lastScrobbleEvent) {
      setLastScrobbleEvent(reportTrackEvent);
      serviceRef.current.handleScrobbleEvent(reportTrackEvent, settings);
    }
  }, [reportTrackEvent, lastScrobbleEvent, settings]);

  return <></>;
}
