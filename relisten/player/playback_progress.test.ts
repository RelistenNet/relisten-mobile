import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  save: vi.fn(),
  state: vi.fn(),
  progressListenerRemove: vi.fn(),
  trackListenerRemove: vi.fn(),
  nativeProgress: undefined as
    | ((event: { elapsed?: number; duration?: number }) => void)
    | undefined,
  nativeTrack: undefined as ((event: { currentIdentifier?: string }) => void) | undefined,
  native: {
    play: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    seekTo: vi.fn(async () => {}),
    seekToTime: vi.fn(async () => {}),
    setNextStream: vi.fn(),
    setShuffleMode: vi.fn(),
    setRepeatMode: vi.fn(),
    addPlaybackProgressListener: vi.fn(),
    addTrackChangedListener: vi.fn(),
  },
}));
vi.mock('@/modules/relisten-audio-player', () => ({
  nativePlayer: harness.native,
  RelistenPlaybackState: {
    Stopped: 'Stopped',
    Playing: 'Playing',
    Paused: 'Paused',
    Stalled: 'Stalled',
  },
}));
vi.mock('@/relisten/player/native_playback_state_hooks', () => ({ addPlayerListeners: vi.fn() }));
vi.mock('@/relisten/realm/schema', () => ({ realm: {} }));
vi.mock('@/relisten/realm/models/player_state', () => ({
  PlayerState: { upsert: harness.save, defaultObject: harness.state, clear: vi.fn() },
}));
vi.mock('@/relisten/realm/models/source_track', () => ({ SourceTrack: class {} }));
vi.mock('@/relisten/offline/download_manager', () => ({ DownloadManager: {} }));
vi.mock('@/relisten/events', () => ({ sharedStatsigClient: vi.fn() }));
vi.mock('@/relisten/util/logging', () => ({
  log: { debug: vi.fn(), extend: () => ({ debug: vi.fn(), warn: vi.fn() }) },
}));
vi.mock('react-native-flash-message', () => ({ showMessage: vi.fn() }));

import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { RelistenPlayer } from './relisten_player';
import { PlayerQueueTrack } from './relisten_player_queue';
import { currentTrackIdentifier, progress, state } from './shared_state';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import type Realm from 'realm';

function track(uuid: string, duration: number) {
  const sourceTrack = {
    uuid,
    duration,
    title: uuid,
    artist: { uuid: 'artist', slug: 'artist', name: 'Artist' },
    show: { uuid: 'show' },
    source: { uuid: 'source', displayDate: '1977-05-08' },
    streamingUrl: () => `https://example.com/${uuid}.mp3`,
    downloadedFileLocation: () => `/tmp/${uuid}.mp3`,
    supportsOfflineDownload: () => false,
  } as unknown as SourceTrack;
  return new PlayerQueueTrack(sourceTrack, uuid, 'Artist', 'Show', 'Album', 'art');
}

describe('player progress track identity', () => {
  let player: RelistenPlayer;
  let first: PlayerQueueTrack;
  let second: PlayerQueueTrack;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    harness.state.mockReset();
    harness.native.addPlaybackProgressListener.mockImplementation((listener) => {
      harness.nativeProgress = listener;
      return { remove: harness.progressListenerRemove };
    });
    harness.native.addTrackChangedListener.mockImplementation((listener) => {
      harness.nativeTrack = listener;
      return { remove: harness.trackListenerRemove };
    });
    currentTrackIdentifier.setState(undefined);
    state.setState(RelistenPlaybackState.Stopped);
    player = new RelistenPlayer();
    first = track('minglewood', 381);
    second = track('loser', 410);
    player.queue.replaceQueue([first, second], undefined);
    harness.nativeTrack?.({ currentIdentifier: first.identifier });
    state.setState(RelistenPlaybackState.Playing);
    harness.nativeProgress?.({ elapsed: 120, duration: 381 });
  });

  afterEach(() => {
    player.dispose();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('queues the next request when native auto-advance arrives before the pending pause resolves', async () => {
    const third = track('third', 430);
    player.queue.addTrackToEndOfQueue([third]);
    let finishPause!: () => void;
    const pendingPause = new Promise<void>((resolve) => {
      finishPause = resolve;
    });
    harness.native.pause.mockImplementationOnce(() => pendingPause);

    player.next();
    expect(harness.native.pause).toHaveBeenCalledTimes(1);
    expect(harness.native.play).not.toHaveBeenCalled();

    // Native reaches the requested track before its pause and play request have run.
    harness.nativeTrack?.({ currentIdentifier: second.identifier });
    player.playTrackAtIndex(2);
    expect(harness.native.pause).toHaveBeenCalledTimes(1);

    finishPause();
    await vi.waitFor(() => expect(harness.native.play).toHaveBeenCalledTimes(1));
    expect(harness.native.play).toHaveBeenLastCalledWith(
      expect.objectContaining({ identifier: third.identifier }),
      undefined
    );
  });

  it('follows an unexpected native transition after the play request is issued', async () => {
    const third = track('third', 430);
    player.queue.addTrackToEndOfQueue([third]);

    player.next();
    await vi.waitFor(() => expect(harness.native.play).toHaveBeenCalledTimes(1));

    harness.nativeTrack?.({ currentIdentifier: third.identifier });

    expect(player.queue.currentTrack).toBe(third);
    expect(progress.lastState()).toEqual({ elapsed: 0, duration: 430, percent: 0 });
  });

  it('saves the new track with its own progress when paused before native progress arrives', async () => {
    player.next();
    await Promise.resolve();
    harness.nativeTrack?.({ currentIdentifier: second.identifier });
    state.setState(RelistenPlaybackState.Playing);
    player.pause();
    vi.advanceTimersByTime(1000);

    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        activeSourceTrackIndex: 1,
        duration: 410,
        elapsed: 0,
        progress: 0,
      })
    );
  });

  it('resets progress for a native automatic track change', () => {
    harness.nativeTrack?.({ currentIdentifier: second.identifier });
    vi.advanceTimersByTime(1000);

    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        activeSourceTrackIndex: 1,
        duration: 410,
        elapsed: 0,
      })
    );
  });

  it('ignores a duplicated previous-track progress event after an automatic change', () => {
    harness.nativeTrack?.({ currentIdentifier: second.identifier });

    // The final progress event from the previous track arrives after the transition.
    harness.nativeProgress?.({ elapsed: 121, duration: 381 });
    expect(progress.lastState()).toEqual({ elapsed: 0, duration: 410, percent: 0 });
    expect(player.progress).toMatchObject({ elapsed: 0, duration: 410 });

    harness.nativeProgress?.({ elapsed: 1, duration: 410 });
    expect(progress.lastState()).toEqual({ elapsed: 1, duration: 410, percent: 1 / 410 });
  });

  it('ignores a stale previous-track event with an invalid duration after an automatic change', () => {
    harness.nativeTrack?.({ currentIdentifier: second.identifier });

    harness.nativeProgress?.({ elapsed: 121, duration: 0 });
    expect(progress.lastState()).toEqual({ elapsed: 0, duration: 410, percent: 0 });
  });

  it('uses a fallback duration when an automatic track has no catalog duration', () => {
    second.sourceTrack.duration = 0;
    harness.nativeTrack?.({ currentIdentifier: second.identifier });

    expect(progress.lastState()).toEqual({ elapsed: 0, duration: 100, percent: 0 });
  });

  it('accepts delayed progress after the automatic-change guard expires', () => {
    harness.nativeTrack?.({ currentIdentifier: second.identifier });
    vi.advanceTimersByTime(5001);

    harness.nativeProgress?.({ elapsed: 121, duration: 381 });
    expect(progress.lastState()).toEqual({ elapsed: 121, duration: 381, percent: 121 / 381 });
  });

  it('preserves confirmed native timing on repeated same-track notifications', () => {
    harness.nativeProgress?.({ elapsed: 130, duration: 382.25 });
    player.queue.onCurrentTrackIdentifierChanged(first.identifier);
    vi.advanceTimersByTime(1000);

    expect(player.progress).toMatchObject({ elapsed: 130, duration: 382.25 });
    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        activeSourceTrackIndex: 0,
        duration: 382.25,
        elapsed: 130,
      })
    );
  });

  it('publishes corrected native duration at the same paused elapsed time', () => {
    player.pause();
    harness.nativeProgress?.({ elapsed: 120, duration: 382.25 });

    expect(progress.lastState()).toEqual({ elapsed: 120, duration: 382.25, percent: 120 / 382.25 });
    expect(player.progress).toEqual(progress.lastState());
  });

  it('keeps confirmed timing when native reports a transient invalid duration', () => {
    player.pause();
    harness.nativeProgress?.({ elapsed: 120, duration: undefined });

    expect(progress.lastState()).toEqual({ elapsed: 120, duration: 381, percent: 120 / 381 });
    expect(player.progress).toEqual(progress.lastState());
  });

  it('removes native event listeners when disposed', () => {
    player.dispose();

    expect(harness.progressListenerRemove).toHaveBeenCalledTimes(1);
    expect(harness.trackListenerRemove).toHaveBeenCalledTimes(1);
  });

  it('ignores previous-track callbacks and progress while a new track is pending', () => {
    player.next();
    harness.nativeTrack?.({ currentIdentifier: first.identifier });
    state.setState(RelistenPlaybackState.Playing);
    harness.nativeProgress?.({ elapsed: 121, duration: 381 });

    expect(player.progress).toMatchObject({ duration: 381, elapsed: 120 });
    expect(progress.lastState()).toMatchObject({ duration: 410, elapsed: 0 });
    harness.nativeTrack?.({ currentIdentifier: second.identifier });
    state.setState(RelistenPlaybackState.Playing);
    player.pause();
    vi.advanceTimersByTime(1000);

    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        activeSourceTrackIndex: 1,
        duration: 410,
        elapsed: 0,
      })
    );
  });

  it('keeps confirmed track progress coherent when a save fires before the next track is confirmed', () => {
    player.next();
    vi.advanceTimersByTime(1000);

    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        activeSourceTrackIndex: 0,
        duration: 381,
        elapsed: 120,
      })
    );
  });

  it('flushes state immediately when playback pauses', () => {
    player.pause();

    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        activeSourceTrackIndex: 0,
        duration: 381,
        elapsed: 120,
      })
    );
  });

  it.each([
    { catalog: 410, saved: 381, elapsed: 120, duration: 410, restoredElapsed: 0 },
    { catalog: 410, saved: 381, elapsed: 500, duration: 410, restoredElapsed: 0 },
    { catalog: 410, saved: 390, elapsed: 120, duration: 410, restoredElapsed: 120 },
    { catalog: 0, saved: 381, elapsed: 120, duration: 381, restoredElapsed: 120 },
    { catalog: undefined, saved: 381, elapsed: 120, duration: 381, restoredElapsed: 120 },
  ])(
    'repairs paused restore with catalog $catalog, saved $saved, elapsed $elapsed',
    async ({ catalog, saved, elapsed, duration, restoredElapsed }) => {
      player.dispose();
      player = new RelistenPlayer();
      second.sourceTrack.duration = catalog;
      harness.state.mockReturnValue({
        queueShuffleState: 1,
        queueRepeatState: 1,
        queueSourceTrackUuids: ['minglewood', 'loser'],
        queueSourceTrackShuffledUuids: ['minglewood', 'loser'],
        activeSourceTrackIndex: 1,
        activeSourceTrackShuffledIndex: 1,
        duration: saved,
        elapsed,
      });
      const cachedRealm = {
        objects: () => ({ filtered: () => [first.sourceTrack, second.sourceTrack] }),
      } as unknown as Realm;

      await player.queue.restorePlayerState(cachedRealm);
      vi.advanceTimersByTime(1000);

      expect(player.queue.currentTrack?.sourceTrack.uuid).toBe('loser');
      expect(player.progress).toEqual({
        duration,
        elapsed: restoredElapsed,
        percent: restoredElapsed / duration,
      });
      expect(harness.save).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          duration,
          elapsed: restoredElapsed,
        })
      );
      expect(harness.native.play).not.toHaveBeenCalled();
    }
  );

  it('restores a newer native snapshot over stale realm state', async () => {
    player.dispose();
    player = new RelistenPlayer();
    harness.state.mockReturnValue({
      queueShuffleState: 1,
      queueRepeatState: 1,
      queueSourceTrackUuids: ['minglewood', 'loser'],
      queueSourceTrackShuffledUuids: ['minglewood', 'loser'],
      activeSourceTrackIndex: 0,
      activeSourceTrackShuffledIndex: 0,
      lastUpdatedAt: new Date(1_000),
      duration: 381,
      elapsed: 120,
    });
    const cachedRealm = {
      objects: () => ({ filtered: () => [first.sourceTrack, second.sourceTrack] }),
    } as unknown as Realm;

    await player.queue.restorePlayerState(cachedRealm, {
      trackUuid: 'loser',
      elapsed: 250,
      duration: 410,
      updatedAtMillis: 2_000,
    });
    vi.advanceTimersByTime(1000);

    expect(player.queue.currentTrack?.sourceTrack.uuid).toBe('loser');
    expect(player.progress).toEqual({
      duration: 410,
      elapsed: 250,
      percent: 250 / 410,
    });
    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        activeSourceTrackIndex: 1,
        duration: 410,
        elapsed: 250,
      })
    );
  });

  it('ignores a native snapshot older than the realm state', async () => {
    player.dispose();
    player = new RelistenPlayer();
    harness.state.mockReturnValue({
      queueShuffleState: 1,
      queueRepeatState: 1,
      queueSourceTrackUuids: ['minglewood', 'loser'],
      queueSourceTrackShuffledUuids: ['minglewood', 'loser'],
      activeSourceTrackIndex: 1,
      activeSourceTrackShuffledIndex: 1,
      lastUpdatedAt: new Date(3_000),
      duration: 410,
      elapsed: 100,
    });
    const cachedRealm = {
      objects: () => ({ filtered: () => [first.sourceTrack, second.sourceTrack] }),
    } as unknown as Realm;

    await player.queue.restorePlayerState(cachedRealm, {
      trackUuid: 'minglewood',
      elapsed: 50,
      duration: 381,
      updatedAtMillis: 2_000,
    });
    vi.advanceTimersByTime(1000);

    expect(player.queue.currentTrack?.sourceTrack.uuid).toBe('loser');
    expect(player.progress).toEqual({
      duration: 410,
      elapsed: 100,
      percent: 100 / 410,
    });
  });
});
