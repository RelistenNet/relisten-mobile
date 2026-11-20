import { useEffect, useState } from 'react';
import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { useNativePlaybackProgress } from '@/relisten/player/native_playback_state_hooks';
import {
  useRelistenPlayer,
  useRelistenPlayerPlaybackState,
} from '@/relisten/player/relisten_player_hooks';
import type { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import {
  useRelistenPlayerCurrentTrack,
  useRelistenPlayerQueueOrderedTracks,
} from '@/relisten/player/relisten_player_queue_hooks';
import {
  estimatedPositionMillis,
  hasNextOccurrence,
  hasPreviousOccurrence,
  isSonosPlaying,
  type SonosOccurrence,
  type SonosPlayback,
} from '@/relisten/sonos/sonos_playback';
import { sonosRemote, useSonosRemote } from '@/relisten/sonos/sonos_remote';
import { formatUuidTypedId } from '@/relisten/util/typed_uuid_id';

/**
 * What the mini player and full player show and control: this phone's
 * playback, or a Sonos room's when one is playing this account's queue.
 * The players read this instead of the phone player directly, so one layout
 * serves both and Play/Pause, Previous, Next and seeking go wherever the
 * music is.
 */
export interface PlaybackView {
  /** The Sonos room playing, or undefined while the phone plays. */
  roomName: string | undefined;
  /**
   * The queue track being played. For Sonos it is the phone's copy of the
   * room's current occurrence, so the players show the same details; it is
   * undefined when the phone's queue no longer matches what the room plays.
   */
  track: PlayerQueueTrack | undefined;
  /** What Sonos says is playing, for when `track` is undefined. */
  fallback: { title: string; artist: string | null } | undefined;
  state: 'playing' | 'paused' | 'buffering';
  /** Seconds, or undefined before the position is known. */
  progress: { elapsed: number; duration: number } | undefined;
  canPrevious: boolean;
  canNext: boolean;
  /** A Sonos command is waiting for the room to confirm it, or the room is being checked. */
  busy: boolean;
  togglePlayPause(): void;
  previous(): void;
  next(): void;
  /** Seeks to an absolute position in seconds. */
  seekTo(seconds: number): void;
}

/**
 * The phone's queue track for the room's current occurrence. The handoff
 * sent the phone's queue in order, so the occurrence's index finds it; the
 * track ID confirms the phone's queue hasn't changed since.
 */
export function sonosQueueTrack(
  tracks: readonly PlayerQueueTrack[],
  occurrence: SonosOccurrence | null | undefined
): PlayerQueueTrack | undefined {
  const track = occurrence ? tracks[occurrence.queueIndex] : undefined;
  return track && formatUuidTypedId('track', track.sourceTrack.uuid) === occurrence?.trackId
    ? track
    : undefined;
}

export function usePlaybackView(): PlaybackView {
  const sonos = useSonosRemote();
  const phone = usePhonePlaybackView();
  const tracks = useRelistenPlayerQueueOrderedTracks();
  const playback = sonos.kind === 'active' ? sonos.playback : undefined;
  const positionMillis = useSonosPosition(playback);

  if (sonos.kind === 'none') {
    return phone;
  }

  const occurrence = playback?.occurrence;
  const track = sonosQueueTrack(tracks, occurrence);
  const ready = sonos.kind === 'active' && !sonos.pending;
  const durationMillis = occurrence?.durationMillis;

  return {
    roomName: sonos.kind === 'active' ? sonos.playback.groupName : sonos.groupName,
    track,
    fallback: occurrence ? { title: occurrence.name, artist: occurrence.artist } : undefined,
    state: !ready ? 'buffering' : playback && isSonosPlaying(playback) ? 'playing' : 'paused',
    progress:
      durationMillis && playback?.positionMillis !== null
        ? { elapsed: positionMillis / 1000, duration: durationMillis / 1000 }
        : undefined,
    canPrevious: ready && !!playback && hasPreviousOccurrence(playback),
    canNext: ready && !!playback && hasNextOccurrence(playback),
    busy: !ready,
    togglePlayPause: () =>
      void sonosRemote.command({ action: playback && isSonosPlaying(playback) ? 'pause' : 'play' }),
    previous: () => void sonosRemote.command({ action: 'previous' }),
    next: () => void sonosRemote.command({ action: 'next' }),
    seekTo: (seconds) =>
      void sonosRemote.command({ action: 'seek', positionMillis: seconds * 1000 }),
  };
}

function usePhonePlaybackView(): PlaybackView {
  const player = useRelistenPlayer();
  const playbackState = useRelistenPlayerPlaybackState();
  const track = useRelistenPlayerCurrentTrack();
  const progress = useNativePlaybackProgress();

  return {
    roomName: undefined,
    track,
    fallback: undefined,
    state:
      playbackState === RelistenPlaybackState.Playing
        ? 'playing'
        : playbackState === RelistenPlaybackState.Stalled
          ? 'buffering'
          : 'paused',
    progress: progress ? { elapsed: progress.elapsed, duration: progress.duration } : undefined,
    // The phone's Previous restarts the track or goes back, so it is always available.
    canPrevious: true,
    canNext: !player.queue.isCurrentTrackLast,
    busy: false,
    togglePlayPause: () => player.togglePauseResume(),
    previous: () => player.back(),
    next: () => player.next(),
    seekTo: (seconds) => {
      if (progress && progress.duration > 0) {
        void player.seekTo(seconds / progress.duration);
      }
    },
  };
}

/** The room's playhead in milliseconds, advanced each second between reads while it plays. */
function useSonosPosition(playback: SonosPlayback | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  const playing = playback ? isSonosPlaying(playback) : false;

  useEffect(() => {
    if (!playing) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [playing]);

  return playback ? estimatedPositionMillis(playback, now) : 0;
}
