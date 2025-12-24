import { AppState, AppStateStatus } from 'react-native';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  CastState,
  MediaQueueType,
  MediaRepeatMode,
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
  const repeatModeMismatchRef = useRef(false);
  const isAdoptingCastSessionRef = useRef(false);
  const shouldLoadFromLocalRef = useRef(false);
  const mediaStatusRef = useRef(mediaStatus);
  const castLoadTimeoutRef = useRef<number | undefined>(undefined);

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

  const clearCastLoadTimeout = useCallback(() => {
    if (castLoadTimeoutRef.current !== undefined) {
      clearTimeout(castLoadTimeoutRef.current);
      castLoadTimeoutRef.current = undefined;
    }
  }, []);

  // Build a queue snapshot to load on Cast. We can optionally prefer local elapsed time
  // because Cast status/streamPosition may not be ready immediately after connecting.
  // Repeat/shuffle are forced off for Cast to match the UI (no controls).
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

      const queueSignature = orderedTracks.map((track) => track.identifier).join('|');

      if (!options?.force && queueSignature === lastQueueSignatureRef.current) {
        return;
      }

      lastQueueSignatureRef.current = queueSignature;

      const queueContext = getQueueContext(autoplay, options?.useLocalElapsed);
      const normalizedQueueContext = {
        ...queueContext,
        repeatState: PlayerRepeatState.REPEAT_OFF,
        shuffleState: PlayerShuffleState.SHUFFLE_OFF,
      };
      logger.debug('Syncing queue to cast', {
        startIndex: normalizedQueueContext.startIndex,
        trackCount: orderedTracks.length,
      });

      syncInFlightRef.current = true;
      try {
        await client.loadMedia({
          autoplay,
          queueData: buildQueueData(normalizedQueueContext),
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

  const syncQueueFromCastStatus = useCallback(
    async (autoplay: boolean, status: typeof mediaStatus) => {
      if (!client || !isCasting || !status?.queueItems?.length) {
        return;
      }

      if (syncInFlightRef.current) {
        logger.debug('Queue sync in flight; skipping cast-status repeat normalization');
        return;
      }

      const queueItems = status.queueItems;
      const currentItemIndex = queueItems.findIndex((item) => item.itemId === status.currentItemId);
      const startTime = streamPosition ?? 0;
      const sanitizedQueueItems = queueItems.map((item) => ({
        mediaInfo: item.mediaInfo,
        autoplay: item.autoplay,
        preloadTime: item.preloadTime,
        startTime: item.startTime,
        playbackDuration: item.playbackDuration,
        activeTrackIds: item.activeTrackIds,
        customData: item.customData,
      }));

      syncInFlightRef.current = true;
      try {
        await client.loadMedia({
          autoplay,
          queueData: {
            items: sanitizedQueueItems,
            type: MediaQueueType.PLAYLIST,
            repeatMode: MediaRepeatMode.OFF,
            startIndex: currentItemIndex >= 0 ? currentItemIndex : 0,
            startTime: startTime > 0 ? startTime : undefined,
          },
        });
      } catch (error) {
        logger.warn('Cast queue sync from status failed', error);
      } finally {
        syncInFlightRef.current = false;
      }
    },
    [client, isCasting, streamPosition]
  );

  // Cast session started: switch the playback driver, pause native audio, then
  // load the queue on Cast using local state for fast start. We store expected
  // track/time so we can reconcile once Cast status arrives. If the receiver
  // already has an active queue (app relaunch), adopt that instead of overwriting it.
  useEffect(() => {
    if (!isCasting || !castDriver) {
      return;
    }

    if (hasInitializedCastRef.current) {
      return;
    }

    const wasPlaying = player.state === RelistenPlaybackState.Playing;
    shouldLoadFromLocalRef.current = wasPlaying || player.playbackIntentStarted;
    isAdoptingCastSessionRef.current = !shouldLoadFromLocalRef.current;
    hasInitializedCastRef.current = true;
    sharedStates.playbackSource.setState(PlaybackSource.Cast);
    player.setPlaybackDriver(castDriver);
    player
      .getNativePlaybackDriver()
      .pause()
      .then(() => {});
    resetCastResumeState();
    lastQueueSignatureRef.current = undefined;
    const existingQueueItems = mediaStatus?.queueItems ?? [];
    const hasActiveCastQueue = existingQueueItems.length > 0;

    if (hasActiveCastQueue) {
      isAdoptingCastSessionRef.current = true;
      shouldLoadFromLocalRef.current = false;
      expectedIdentifierRef.current = (
        existingQueueItems.find((item) => item.itemId === mediaStatus?.currentItemId)?.mediaInfo
          ?.customData as { identifier?: string } | undefined
      )?.identifier;
      expectedElapsedRef.current = streamPosition ?? 0;
      hasReconciledRef.current = true;
      clearCastLoadTimeout();
      return;
    }

    isAdoptingCastSessionRef.current = false;
    client?.requestStatus().then(() => {});
    clearCastLoadTimeout();
    // Only fall back to loading the local queue if the user explicitly initiated
    // playback while casting (or was already playing when they hit Cast).
    castLoadTimeoutRef.current = setTimeout(() => {
      if (!isCastingRef.current) {
        return;
      }
      const status = mediaStatusRef.current;
      if (status?.queueItems?.length) {
        return;
      }
      if (!shouldLoadFromLocalRef.current) {
        return;
      }
      expectedIdentifierRef.current =
        player.queue.currentTrack?.identifier ??
        player.queue.orderedTracks[player.queue.currentIndex ?? 0]?.identifier;
      expectedElapsedRef.current = player.progress?.elapsed ?? 0;
      hasReconciledRef.current = false;

      const shouldAutoplay = wasPlaying;
      syncQueueToCast(shouldAutoplay, { useLocalElapsed: true }).then(() => {});
    }, 1000) as unknown as number;
  }, [
    castDriver,
    client,
    isCasting,
    mediaStatus,
    player,
    resetCastResumeState,
    streamPosition,
    syncQueueToCast,
    clearCastLoadTimeout,
  ]);

  // Consume Cast media status and translate it into the app's shared playback state.
  // Also reconcile initial queue load if Cast starts on an unexpected item/time.
  useEffect(() => {
    if (!isCasting) {
      return;
    }

    mediaStatusRef.current = mediaStatus;

    if (!mediaStatus) {
      sharedStates.state.setState(RelistenPlaybackState.Stopped);
      lastCastStateRef.current = RelistenPlaybackState.Stopped;
      resetCastResumeState();
      return;
    }

    if (mediaStatus.queueRepeatMode && mediaStatus.queueRepeatMode !== MediaRepeatMode.OFF) {
      if (!repeatModeMismatchRef.current) {
        repeatModeMismatchRef.current = true;
        const shouldAutoplay =
          mapMediaPlayerState(mediaStatus.playerState) === RelistenPlaybackState.Playing;
        if (shouldLoadFromLocalRef.current) {
          logger.warn('Cast repeat mode out of sync; forcing repeat off via local queue');
          syncQueueToCast(shouldAutoplay, { force: true }).then(() => {});
        } else {
          logger.warn('Cast repeat mode out of sync; forcing repeat off via cast queue');
          syncQueueFromCastStatus(shouldAutoplay, mediaStatus).then(() => {});
        }
      }
    } else if (repeatModeMismatchRef.current) {
      repeatModeMismatchRef.current = false;
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
    if (mediaStatus.queueItems?.length && isAdoptingCastSessionRef.current) {
      shouldLoadFromLocalRef.current = false;
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
    if (!isCasting) {
      clearCastLoadTimeout();
    }
  }, [isCasting]);

  useEffect(() => {
    castStateRef.current = castState;
  }, [castState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState !== 'active') {
        clearDisconnectTimeout();
        return;
      }

      if (isCastingRef.current && client) {
        client.requestStatus().catch((error) => {
          logger.debug('Failed to request Cast status on foreground', error);
        });
      }
    });

    return () => subscription.remove();
  }, [clearDisconnectTimeout, client]);

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

  // Whenever the local queue changes while casting, reload the Cast queue snapshot
  // with repeat/shuffle forced off (the UI doesn't expose those modes).
  useEffect(() => {
    if (!isCasting) {
      return;
    }

    const orderedTracksTeardown = player.queue.onOrderedTracksChanged.addListener(() => {
      if (isAdoptingCastSessionRef.current && !player.playbackIntentStarted) {
        return;
      }
      if (!player.playbackIntentStarted && !shouldLoadFromLocalRef.current) {
        return;
      }
      isAdoptingCastSessionRef.current = false;
      shouldLoadFromLocalRef.current = true;
      const shouldAutoplay = lastCastWasPlayingRef.current;
      syncQueueToCast(shouldAutoplay).then(() => {});
    });

    return () => {
      orderedTracksTeardown();
    };
  }, [isCasting, player.queue, syncQueueToCast]);
}
