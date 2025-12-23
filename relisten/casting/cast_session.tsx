import { AppState, AppStateStatus } from 'react-native';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  CastState,
  useCastState,
  useMediaStatus,
  useRemoteMediaClient,
  useStreamPosition,
} from 'react-native-google-cast';
import { RelistenPlayer } from '@/relisten/player/relisten_player';
import { PlaybackSource, sharedStates } from '@/relisten/player/shared_state';
import { log } from '@/relisten/util/logging';
import {
  CastPlaybackDriver,
  buildQueueData,
  mapMediaPlayerState,
} from '@/relisten/casting/cast_driver';
import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { PlayerRepeatState, PlayerShuffleState } from '@/relisten/player/relisten_player_queue';

const logger = log.extend('cast-session');

function isConnected(castState?: CastState | null) {
  return castState === CastState.CONNECTED;
}

export function useRelistenCastSession(player: RelistenPlayer) {
  const castState = useCastState();
  const client = useRemoteMediaClient();
  const mediaStatus = useMediaStatus();
  const streamPosition = useStreamPosition(1);

  const isCasting = isConnected(castState) && !!client;
  const castDriver = useMemo(() => (client ? new CastPlaybackDriver(client) : undefined), [client]);

  const wasCastingRef = useRef(false);
  const lastCastElapsedRef = useRef<number | undefined>(undefined);
  const lastCastStateRef = useRef<RelistenPlaybackState | undefined>(undefined);
  const lastCastWasPlayingRef = useRef(false);
  const lastCastIdentifierRef = useRef<string | undefined>(undefined);
  const expectedIdentifierRef = useRef<string | undefined>(undefined);
  const expectedElapsedRef = useRef<number | undefined>(undefined);
  const hasReconciledRef = useRef(false);
  const hasInitializedCastRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const pendingSyncRef = useRef<{
    autoplay: boolean;
    options?: { force?: boolean; useLocalElapsed?: boolean };
  } | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const castStateRef = useRef(castState);
  const disconnectTimeoutRef = useRef<number | undefined>(undefined);
  const isCastingRef = useRef(isCasting);
  const lastQueueSignatureRef = useRef<string | undefined>(undefined);

  // Clear any cached state used to resume local playback after a cast session ends.
  const resetCastResumeState = useCallback(() => {
    lastCastElapsedRef.current = undefined;
    lastCastStateRef.current = undefined;
    lastCastWasPlayingRef.current = false;
    lastCastIdentifierRef.current = undefined;
  }, []);

  const clearDisconnectTimeout = useCallback(() => {
    if (disconnectTimeoutRef.current !== undefined) {
      clearTimeout(disconnectTimeoutRef.current);
      disconnectTimeoutRef.current = undefined;
    }
  }, []);

  // Build a queue snapshot to load on Cast. We can optionally prefer local elapsed time
  // because Cast status/streamPosition may not be ready immediately after connecting.
  const getQueueContext = useCallback(
    (autoplay: boolean, useLocalElapsed: boolean = false) => {
      const orderedTracks = player.queue.orderedTracks;
      const startIndex = player.queue.currentIndex ?? 0;
      const localElapsed = player.progress?.elapsed ?? 0;
      const elapsed = useLocalElapsed ? localElapsed : (streamPosition ?? localElapsed);

      return {
        orderedTracks,
        startIndex,
        startTimeMs: elapsed > 0 ? elapsed * 1000.0 : undefined,
        repeatState: player.queue.repeatState ?? PlayerRepeatState.REPEAT_OFF,
        shuffleState: player.queue.shuffleState ?? PlayerShuffleState.SHUFFLE_OFF,
        autoplay,
      };
    },
    [player, streamPosition]
  );

  // Reload the entire queue on Cast (this library version lacks fine-grained queue mutations).
  // When "force" is true, reload even if the queue signature matches.
  const syncQueueToCast = useCallback(
    async (autoplay: boolean, options?: { force?: boolean; useLocalElapsed?: boolean }) => {
      if (!client || !isCasting) {
        return;
      }

      if (syncInFlightRef.current) {
        pendingSyncRef.current = { autoplay, options };
        logger.debug('Queue sync in flight; coalescing a follow-up sync request');
        return;
      }

      const orderedTracks = player.queue.orderedTracks;
      if (orderedTracks.length === 0) {
        return;
      }

      const queueSignature = [
        orderedTracks.map((track) => track.identifier).join('|'),
        player.queue.repeatState,
        player.queue.shuffleState,
      ].join('|');

      if (!options?.force && queueSignature === lastQueueSignatureRef.current) {
        return;
      }

      lastQueueSignatureRef.current = queueSignature;

      const queueContext = getQueueContext(autoplay, options?.useLocalElapsed);
      logger.debug('Syncing queue to cast', {
        startIndex: queueContext.startIndex,
        trackCount: orderedTracks.length,
      });

      syncInFlightRef.current = true;
      try {
        await client.loadMedia({
          autoplay,
          queueData: buildQueueData(queueContext),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes('aborted') ||
          message.includes('overridding request') ||
          message.includes('Invalid request')
        ) {
          logger.debug('Cast queue sync aborted or superseded');
        } else {
          logger.warn('Cast queue sync failed', error);
        }
      } finally {
        syncInFlightRef.current = false;
        if (pendingSyncRef.current) {
          const pending = pendingSyncRef.current;
          pendingSyncRef.current = null;
          syncQueueToCast(pending.autoplay, pending.options).then(() => {});
        }
      }
    },
    [client, getQueueContext, isCasting, player.queue]
  );

  // Cast session started: switch the playback driver, pause native audio, then
  // load the queue on Cast using local state for fast start. We store expected
  // track/time so we can reconcile once Cast status arrives.
  useEffect(() => {
    if (!isCasting || !castDriver) {
      return;
    }

    if (hasInitializedCastRef.current) {
      return;
    }

    hasInitializedCastRef.current = true;
    sharedStates.playbackSource.setState(PlaybackSource.Cast);
    player.setPlaybackDriver(castDriver);
    player
      .getNativePlaybackDriver()
      .pause()
      .then(() => {});
    resetCastResumeState();
    lastQueueSignatureRef.current = undefined;
    expectedIdentifierRef.current =
      player.queue.currentTrack?.identifier ??
      player.queue.orderedTracks[player.queue.currentIndex ?? 0]?.identifier;
    expectedElapsedRef.current = player.progress?.elapsed ?? 0;
    hasReconciledRef.current = false;

    const shouldAutoplay = player.state === RelistenPlaybackState.Playing;
    syncQueueToCast(shouldAutoplay, { useLocalElapsed: true }).then(() => {});
  }, [castDriver, isCasting, player, resetCastResumeState, syncQueueToCast]);

  // Consume Cast media status and translate it into the app's shared playback state.
  // Also reconcile initial queue load if Cast starts on an unexpected item/time.
  useEffect(() => {
    if (!isCasting) {
      return;
    }

    if (!mediaStatus) {
      sharedStates.state.setState(RelistenPlaybackState.Stopped);
      lastCastStateRef.current = RelistenPlaybackState.Stopped;
      resetCastResumeState();
      return;
    }

    const playbackState = mapMediaPlayerState(mediaStatus.playerState);
    sharedStates.state.setState(playbackState);
    lastCastStateRef.current = playbackState;
    lastCastWasPlayingRef.current = playbackState === RelistenPlaybackState.Playing;

    const queueItems = mediaStatus.queueItems ?? [];
    const currentItem =
      queueItems.find((item) => item.itemId === mediaStatus.currentItemId) ??
      queueItems.find((item) => item.mediaInfo?.customData);
    const identifier = (currentItem?.mediaInfo?.customData as { identifier?: string })?.identifier;

    if (identifier) {
      sharedStates.currentTrackIdentifier.setState(identifier);
      lastCastIdentifierRef.current = identifier;
    }

    if (!hasReconciledRef.current && expectedIdentifierRef.current && identifier) {
      if (identifier !== expectedIdentifierRef.current) {
        const shouldAutoplay = playbackState === RelistenPlaybackState.Playing;
        syncQueueToCast(shouldAutoplay, { force: true, useLocalElapsed: true }).then(() => {});
        hasReconciledRef.current = true;
        return;
      }

      const expectedElapsed = expectedElapsedRef.current ?? 0;
      const currentElapsed = streamPosition ?? 0;
      if (expectedElapsed > 5 && currentElapsed < 1) {
        player.seekToTime(expectedElapsed).then(() => {});
      }

      hasReconciledRef.current = true;
    }
  }, [isCasting, mediaStatus, player, resetCastResumeState, streamPosition, syncQueueToCast]);

  // Keep progress in sync from Cast, and reset download progress (not relevant when casting).
  useEffect(() => {
    if (!isCasting) {
      return;
    }

    const queueItems = mediaStatus?.queueItems ?? [];
    const currentItem =
      queueItems.find((item) => item.itemId === mediaStatus?.currentItemId) ??
      queueItems.find((item) => item.mediaInfo?.customData);
    const duration =
      currentItem?.mediaInfo?.streamDuration ?? mediaStatus?.mediaInfo?.streamDuration ?? 0;

    const elapsed = streamPosition ?? 0;
    if (duration > 0) {
      sharedStates.progress.setState({
        elapsed,
        duration,
        percent: elapsed / duration,
      });
    }

    sharedStates.activeTrackDownloadProgress.setState({
      downloadedBytes: 0,
      totalBytes: 1,
      percent: 0.0,
    });

    lastCastElapsedRef.current = elapsed;
  }, [isCasting, mediaStatus, streamPosition]);

  // Cast session ended: switch back to native playback. If Cast was actively playing,
  // try to resume the same track/time locally. Otherwise only seek when safe.
  useEffect(() => {
    isCastingRef.current = isCasting;
  }, [isCasting]);

  useEffect(() => {
    castStateRef.current = castState;
  }, [castState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState !== 'active') {
        clearDisconnectTimeout();
      }
    });

    return () => subscription.remove();
  }, [clearDisconnectTimeout]);

  useEffect(() => {
    if (isCasting || !wasCastingRef.current) {
      wasCastingRef.current = isCasting;
      if (!isCasting) {
        hasInitializedCastRef.current = false;
      }
      clearDisconnectTimeout();
      return;
    }

    if (appStateRef.current !== 'active') {
      return;
    }

    if (castState === CastState.CONNECTING) {
      return;
    }

    if (disconnectTimeoutRef.current !== undefined) {
      return;
    }

    // Debounce brief Cast disconnects during app backgrounding or session handoff.
    disconnectTimeoutRef.current = setTimeout(() => {
      disconnectTimeoutRef.current = undefined;

      if (isCastingRef.current) {
        return;
      }

      const currentCastState = castStateRef.current;
      if (
        currentCastState !== CastState.NOT_CONNECTED &&
        currentCastState !== CastState.NO_DEVICES_AVAILABLE
      ) {
        return;
      }

      sharedStates.playbackSource.setState(PlaybackSource.Native);
      player.setPlaybackDriver(player.getNativePlaybackDriver());

      const elapsed = lastCastElapsedRef.current;
      const lastIdentifier = lastCastIdentifierRef.current;
      const shouldResume = lastCastWasPlayingRef.current;
      const isCurrentTrack = player.queue.currentTrack?.identifier === lastIdentifier;

      if (shouldResume && lastIdentifier) {
        const orderedTracks = player.queue.orderedTracks;
        const index = orderedTracks.findIndex((track) => track.identifier === lastIdentifier);

        if (index >= 0) {
          if (isCurrentTrack) {
            if (elapsed !== undefined) {
              player.seekToTime(elapsed).then(() => {});
            }
            player.resume();
          } else {
            player.playTrackAtIndex(index, elapsed);
          }
        } else if (elapsed !== undefined) {
          player.seekToTime(elapsed).then(() => {});
          player.resume();
        } else {
          player.resume();
        }
      } else if (elapsed !== undefined && lastIdentifier && isCurrentTrack) {
        player.seekToTime(elapsed).then(() => {});
      }

      resetCastResumeState();
      expectedIdentifierRef.current = undefined;
      expectedElapsedRef.current = undefined;
      hasReconciledRef.current = false;
      hasInitializedCastRef.current = false;
      wasCastingRef.current = false;
    }, 3000) as unknown as number;
  }, [castState, clearDisconnectTimeout, isCasting, player, resetCastResumeState]);

  // Whenever the local queue or repeat/shuffle settings change while casting,
  // reload the Cast queue snapshot to preserve parity.
  useEffect(() => {
    if (!isCasting) {
      return;
    }

    const orderedTracksTeardown = player.queue.onOrderedTracksChanged.addListener(() => {
      const shouldAutoplay = lastCastWasPlayingRef.current;
      syncQueueToCast(shouldAutoplay).then(() => {});
    });

    const repeatTeardown = player.queue.onRepeatStateChanged.addListener(() => {
      const shouldAutoplay = lastCastWasPlayingRef.current;
      syncQueueToCast(shouldAutoplay).then(() => {});
    });

    const shuffleTeardown = player.queue.onShuffleStateChanged.addListener(() => {
      const shouldAutoplay = lastCastWasPlayingRef.current;
      syncQueueToCast(shouldAutoplay).then(() => {});
    });

    return () => {
      orderedTracksTeardown();
      repeatTeardown();
      shuffleTeardown();
    };
  }, [isCasting, player.queue, syncQueueToCast]);
}
