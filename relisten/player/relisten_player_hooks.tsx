import React, { useContext, createContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  nativePlayer,
  RelistenStreamable,
  RelistenRemoteControlEvent,
  RelistenPlaybackState,
  RelistenTrackChangedEvent,
  RelistenErrorEvent,
  RelistenPlaybackErrorToName,
} from '@/../modules/relisten-audio-player';
import { NetInfo } from 'react-native';
import { audioStreamLog } from '@/relisten/util/logging-enhanced';

// Type definitions for the context
export interface RelistenPlayerContextType {
  play: (streamable: RelistenStreamable, startingAtMs?: number) => Promise<void>;
  setNextStream: (streamable?: RelistenStreamable) => void;
  resume: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  next: () => Promise<void>;
  seekTo: (percent: number) => Promise<void>;
  seekToTime: (timeMs: number) => Promise<void>;
  playbackState: RelistenPlaybackState;
  currentStreamable?: RelistenStreamable;
  previousStreamable?: RelistenStreamable;
  elapsedMs?: number;
  durationMs?: number;
  activeTrackDownloadProgress: { downloadedBytes: number; totalBytes: number };
}

// Create the context
const RelistenPlayerContext = createContext<RelistenPlayerContextType | null>(null);

// Custom hook for access to the player
export function useRelistenPlayer() {
  const context = useContext(RelistenPlayerContext);
  if (context === null) {
    throw new Error('useRelistenPlayer must be used within a RelistenPlayerProvider');
  }
  return context;
}

// Provider component
export const RelistenPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [playbackState, setPlaybackState] = useState<RelistenPlaybackState>(
    RelistenPlaybackState.Stopped
  );
  const [currentStreamable, setCurrentStreamable] = useState<RelistenStreamable | undefined>();
  const [previousStreamable, setPreviousStreamable] = useState<RelistenStreamable | undefined>();
  const [elapsedMs, setElapsedMs] = useState<number | undefined>();
  const [durationMs, setDurationMs] = useState<number | undefined>();
  const [activeTrackDownloadProgress, setActiveTrackDownloadProgress] = useState({
    downloadedBytes: 0,
    totalBytes: 0,
  });
  
  // Reference to track retry attempts for timeouts
  const retryAttemptsRef = useRef<Record<string, number>>({});
  const maxRetryAttempts = 3;
  
  // Track network status
  const [networkState, setNetworkState] = useState<{
    isConnected: boolean;
    type: string;
    details: any;
  }>({
    isConnected: true,
    type: 'unknown',
    details: null,
  });

  // Setup error listener with enhanced handling
  useEffect(() => {
    const subscription = nativePlayer.addErrorListener((error: RelistenErrorEvent) => {
      const errorName = RelistenPlaybackErrorToName[error.error];
      const isTimeout = errorName === 'ServerTimeout';
      const streamId = error.identifier || 'unknown';
      
      // Get enhanced details about the error for logging
      const enhancedDetails = {
        errorName,
        errorCode: error.error,
        streamId,
        networkState,
        currentPlaybackState: playbackState,
      };
      
      if (isTimeout) {
        // Track retry attempts for this stream
        if (!retryAttemptsRef.current[streamId]) {
          retryAttemptsRef.current[streamId] = 0;
        }
        
        // Increment retry counter
        retryAttemptsRef.current[streamId]++;
        
        // Add retry information to logs
        enhancedDetails['retryCount'] = retryAttemptsRef.current[streamId];
        enhancedDetails['maxRetries'] = maxRetryAttempts;
        
        // Log with the specialized audio stream logger
        audioStreamLog.timeoutError(
          `BASS_ERROR_TIMEOUT: Server did not respond (attempt ${retryAttemptsRef.current[streamId]}/${maxRetryAttempts})`,
          enhancedDetails
        );
        
        // If we haven't exceeded max retries and we have a current streamable, retry
        if (
          retryAttemptsRef.current[streamId] <= maxRetryAttempts && 
          currentStreamable && 
          networkState.isConnected
        ) {
          // If we're still below retry limit, try again with exponential backoff
          const backoffDelay = Math.min(1000 * Math.pow(2, retryAttemptsRef.current[streamId] - 1), 8000);
          
          audioStreamLog.info(`Retrying playback in ${backoffDelay}ms`, { streamId });
          
          // Attempt to resume if stalled
          if (playbackState === RelistenPlaybackState.Stalled) {
            setTimeout(() => {
              nativePlayer.resume().catch(e => {
                audioStreamLog.error('Failed to resume after timeout', e);
              });
            }, backoffDelay);
          }
        } else if (retryAttemptsRef.current[streamId] > maxRetryAttempts) {
          // We've exceeded retry attempts, show a user-friendly message
          audioStreamLog.warning('Maximum retry attempts reached for stream', { 
            streamId, 
            attempts: retryAttemptsRef.current[streamId] 
          });
          
          // Reset retry counter for future attempts
          delete retryAttemptsRef.current[streamId];
        }
      } else {
        // For non-timeout errors, use regular logging
        audioStreamLog.error(`Player error: ${error.errorMessage}`, enhancedDetails);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [networkState, playbackState, currentStreamable]);

  // Setup network monitoring
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setNetworkState({
        isConnected: state.isConnected ?? true,
        type: state.type,
        details: state.details,
      });
      
      // Log network status changes that might affect playback
      if (!state.isConnected && playbackState !== RelistenPlaybackState.Stopped) {
        audioStreamLog.info('Network connection lost during playback', {
          playbackState,
          currentStreamable: currentStreamable?.identifier,
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [playbackState, currentStreamable]);

  // Setup playback state listener
  useEffect(() => {
    const subscription = nativePlayer.addPlaybackStateListener(({ newPlaybackState }) => {
      setPlaybackState(newPlaybackState);
      
      // When playback resumes from stalled state, reset retry counters
      if (
        newPlaybackState === RelistenPlaybackState.Playing && 
        currentStreamable &&
        retryAttemptsRef.current[currentStreamable.identifier]
      ) {
        audioStreamLog.info('Playback resumed after stall', { 
          streamId: currentStreamable.identifier,
          previousRetries: retryAttemptsRef.current[currentStreamable.identifier]
        });
        
        delete retryAttemptsRef.current[currentStreamable.identifier];
      }
    });

    return () => {
      subscription.remove();
    };
  }, [currentStreamable]);

  // Setup track changed listener
  useEffect(() => {
    const subscription = nativePlayer.addTrackChangedListener(
      ({ previousIdentifier, currentIdentifier }: RelistenTrackChangedEvent) => {
        if (previousIdentifier) {
          setPreviousStreamable(
            currentStreamable && currentStreamable.identifier === previousIdentifier
              ? currentStreamable
              : undefined
          );
        }

        if (currentIdentifier) {
          // Reset retry count when track changes
          if (currentIdentifier in retryAttemptsRef.current) {
            delete retryAttemptsRef.current[currentIdentifier];
          }
        } else {
          setCurrentStreamable(undefined);
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [currentStreamable]);

  // Setup progress listeners
  useEffect(() => {
    const progressSubscription = nativePlayer.addPlaybackProgressListener(({ elapsed, duration }) => {
      setElapsedMs(elapsed ? elapsed * 1000 : undefined);
      setDurationMs(duration ? duration * 1000 : undefined);
    });

    const downloadSubscription = nativePlayer.addDownloadProgressListener(
      ({ forActiveTrack, downloadedBytes, totalBytes }) => {
        if (forActiveTrack) {
          setActiveTrackDownloadProgress({ downloadedBytes, totalBytes });
        }
      }
    );

    return () => {
      progressSubscription.remove();
      downloadSubscription.remove();
    };
  }, []);

  // Play function with enhanced error handling
  const play = useCallback(
    async (streamable: RelistenStreamable, startingAtMs?: number) => {
      try {
        // Reset retry count for new streams
        if (streamable.identifier in retryAttemptsRef.current) {
          delete retryAttemptsRef.current[streamable.identifier];
        }
        
        setCurrentStreamable(streamable);
        await nativePlayer.play(streamable, startingAtMs);
      } catch (error) {
        audioStreamLog.error('Error playing stream', {
          streamId: streamable.identifier,
          error,
        });
        throw error;
      }
    },
    []
  );

  // Other player control functions
  const setNextStream = useCallback((streamable?: RelistenStreamable) => {
    nativePlayer.setNextStream(streamable);
  }, []);

  const resume = useCallback(async () => {
    try {
      await nativePlayer.resume();
    } catch (error) {
      audioStreamLog.error('Error resuming playback', error);
      throw error;
    }
  }, []);

  const pause = useCallback(async () => {
    try {
      await nativePlayer.pause();
    } catch (error) {
      audioStreamLog.error('Error pausing playback', error);
      throw error;
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await nativePlayer.stop();
      
      // Clear all retry attempts when stopping
      retryAttemptsRef.current = {};
    } catch (error) {
      audioStreamLog.error('Error stopping playback', error);
      throw error;
    }
  }, []);

  const next = useCallback(async () => {
    try {
      await nativePlayer.next();
    } catch (error) {
      audioStreamLog.error('Error skipping to next track', error);
      throw error;
    }
  }, []);

  const seekTo = useCallback(async (percent: number) => {
    try {
      await nativePlayer.seekTo(percent);
    } catch (error) {
      audioStreamLog.error('Error seeking to position', { percent, error });
      throw error;
    }
  }, []);

  const seekToTime = useCallback(async (timeMs: number) => {
    try {
      await nativePlayer.seekToTime(timeMs);
    } catch (error) {
      audioStreamLog.error('Error seeking to time', { timeMs, error });
      throw error;
    }
  }, []);

  const value: RelistenPlayerContextType = {
    play,
    setNextStream,
    resume,
    pause,
    stop,
    next,
    seekTo,
    seekToTime,
    playbackState,
    currentStreamable,
    previousStreamable,
    elapsedMs,
    durationMs,
    activeTrackDownloadProgress,
  };

  return <RelistenPlayerContext.Provider value={value}>{children}</RelistenPlayerContext.Provider>;
};
