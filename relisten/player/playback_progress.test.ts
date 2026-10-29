import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RelistenPlaybackSnapshot } from '@/modules/relisten-audio-player';

const harness = vi.hoisted(() => ({
  save: vi.fn(),
  state: vi.fn(),
  progressListenerRemove: vi.fn(),
  trackListenerRemove: vi.fn(),
  nativeProgress: undefined as
    | ((event: {
        elapsed?: number;
        duration?: number;
        identifier?: string;
        sequence?: number;
        checkpoint?: boolean;
      }) => void)
    | undefined,
  nativeSnapshot: undefined as ((event: RelistenPlaybackSnapshot) => void) | undefined,
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
    addPlaybackSnapshotListener: vi.fn(),
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
import { PlayerQueueTrack, PlayerShuffleState } from './relisten_player_queue';
import type { PlayerStateProps } from '@/relisten/realm/models/player_state';
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

function savedState(overrides: Partial<PlayerStateProps> = {}) {
  const props: PlayerStateProps = {
    queueEntries: [
      { id: 'A', sourceTrackUuid: 'minglewood' },
      { id: 'B', sourceTrackUuid: 'loser' },
    ],
    shuffleOrder: null,
    repeatMode: 1,
    checkpoint: { entryId: 'B', elapsedSeconds: 120, durationSeconds: 410 },
    lastUpdatedAt: new Date(),
    ...overrides,
  };
  return props;
}

describe('player progress track identity', () => {
  let player: RelistenPlayer;
  let first: PlayerQueueTrack;
  let second: PlayerQueueTrack;
  let sequence = 0;
  let nativeIdentifier: string;
  function snapshot(event: Partial<RelistenPlaybackSnapshot>) {
    const identifier = event.identifier ?? nativeIdentifier;
    const track = player.queue.orderedTracks.find((track) => track.identifier === identifier);
    return {
      sessionId: 'native-test',
      sequence: ++sequence,
      identifier,
      sourceTrackUuid: track?.sourceTrack.uuid ?? 'removed',
      playbackState: RelistenPlaybackState.Playing,
      checkpoint: false,
      ...event,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    harness.state.mockReset();
    sequence = 0;
    harness.native.addPlaybackSnapshotListener.mockImplementation((listener) => {
      harness.nativeSnapshot = listener;
      harness.nativeTrack = (event) => {
        nativeIdentifier = event.currentIdentifier!;
        listener(snapshot({ identifier: nativeIdentifier }));
      };
      harness.nativeProgress = (event) => listener(snapshot(event));
      return { remove: harness.progressListenerRemove };
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
        checkpoint: expect.objectContaining({
          entryId: second.identifier,
          durationSeconds: 410,
          elapsedSeconds: 0,
        }),
      })
    );
  });

  it('resets progress for a native automatic track change', () => {
    harness.nativeTrack?.({ currentIdentifier: second.identifier });
    vi.advanceTimersByTime(1000);

    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        checkpoint: expect.objectContaining({
          entryId: second.identifier,
          durationSeconds: 410,
          elapsedSeconds: 0,
        }),
      })
    );
  });

  it('ignores a duplicated previous-track progress event after an automatic change', () => {
    const stale = snapshot({ elapsed: 121, duration: 381, identifier: first.identifier });
    harness.nativeTrack?.({ currentIdentifier: second.identifier });

    // The final progress event from the previous track arrives after the transition.
    harness.nativeSnapshot?.(stale);
    expect(progress.lastState()).toEqual({ elapsed: 0, duration: 410, percent: 0 });
    expect(player.progress).toMatchObject({ elapsed: 0, duration: 410 });

    harness.nativeProgress?.({ elapsed: 1, duration: 410 });
    expect(progress.lastState()).toEqual({ elapsed: 1, duration: 410, percent: 1 / 410 });
  });

  it('uses a fallback duration when an automatic track has no catalog duration', () => {
    second.sourceTrack.duration = 0;
    harness.nativeTrack?.({ currentIdentifier: second.identifier });

    expect(progress.lastState()).toEqual({ elapsed: 0, duration: 100, percent: 0 });
  });

  it('accepts identified current-track progress after an automatic change', () => {
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
        checkpoint: expect.objectContaining({
          entryId: first.identifier,
          durationSeconds: 382.25,
          elapsedSeconds: 130,
        }),
      })
    );
  });

  it('publishes corrected native duration at the same paused elapsed time', () => {
    player.pause();
    harness.nativeProgress?.({ elapsed: 120, duration: 382.25 });

    expect(progress.lastState()).toEqual({ elapsed: 120, duration: 382.25, percent: 120 / 382.25 });
    expect(player.progress).toEqual(progress.lastState());
  });

  it('keeps current native timing for immediate saves while publishing progress once per second', () => {
    harness.nativeProgress?.({ elapsed: 120.1, duration: 381, checkpoint: true });
    harness.nativeProgress?.({ elapsed: 120.35, duration: 381 });
    harness.nativeProgress?.({ elapsed: 120.8, duration: 381 });
    expect(progress.lastState()?.elapsed).toBe(120.1);
    expect(player.progress?.elapsed).toBe(120.8);
    player.pause();
    expect(harness.save.mock.calls.at(-1)?.[1].checkpoint.elapsedSeconds).toBe(120.8);
    harness.nativeProgress?.({ elapsed: 121.1, duration: 381 });
    expect(progress.lastState()?.elapsed).toBe(121.1);
  });

  it('reports a listening threshold crossed between UI progress updates', () => {
    const report = vi.fn();
    player.onShouldReportTrack.addListener(report);
    harness.nativeProgress?.({ elapsed: 185.2, duration: 371.2 });
    harness.nativeProgress?.({ elapsed: 185.8, duration: 371.2 });
    expect(progress.lastState()?.elapsed).toBe(185.2);
    expect(report).toHaveBeenCalledTimes(1);
    harness.nativeProgress?.({ elapsed: 186.1, duration: 371.2 });
    expect(report).toHaveBeenCalledTimes(1);
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
    expect(harness.trackListenerRemove).not.toHaveBeenCalled();
  });

  it('ignores previous-track callbacks and progress while a new track is pending', () => {
    player.next();
    harness.nativeTrack?.({ currentIdentifier: first.identifier });
    state.setState(RelistenPlaybackState.Playing);
    harness.nativeProgress?.({ elapsed: 121, duration: 381 });

    expect(player.progress).toMatchObject({ duration: 381, elapsed: 121 });
    expect(progress.lastState()).toMatchObject({ duration: 410, elapsed: 0 });
    harness.nativeTrack?.({ currentIdentifier: second.identifier });
    state.setState(RelistenPlaybackState.Playing);
    player.pause();
    vi.advanceTimersByTime(1000);

    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        checkpoint: expect.objectContaining({
          entryId: second.identifier,
          durationSeconds: 410,
          elapsedSeconds: 0,
        }),
      })
    );
  });

  it('keeps confirmed track progress coherent when a save fires before the next track is confirmed', () => {
    player.next();
    vi.advanceTimersByTime(5000);

    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        checkpoint: expect.objectContaining({
          entryId: first.identifier,
          durationSeconds: 381,
          elapsedSeconds: 120,
        }),
      })
    );
  });

  it.each([
    { catalog: 410, saved: 381, elapsed: 120, duration: 381, restoredElapsed: 120 },
    { catalog: 410, saved: 381, elapsed: 500, duration: 381, restoredElapsed: 381 },
    { catalog: 410, saved: undefined, elapsed: 120, duration: 410, restoredElapsed: 120 },
    { catalog: 0, saved: 381, elapsed: 120, duration: 381, restoredElapsed: 120 },
    { catalog: undefined, saved: 381, elapsed: 120, duration: 381, restoredElapsed: 120 },
  ])(
    'restores checkpoint with catalog $catalog, saved $saved, elapsed $elapsed',
    async ({ catalog, saved, elapsed, duration, restoredElapsed }) => {
      player.dispose();
      player = new RelistenPlayer();
      second.sourceTrack.duration = catalog;
      harness.state.mockReturnValue(
        savedState({
          checkpoint: { entryId: 'B', elapsedSeconds: elapsed, durationSeconds: saved },
        })
      );
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
          checkpoint: expect.objectContaining({
            durationSeconds: duration,
            elapsedSeconds: restoredElapsed,
          }),
        })
      );
      expect(harness.native.play).not.toHaveBeenCalled();
    }
  );
  it('commits an interruption snapshot immediately and cancels older pending work', () => {
    harness.nativeProgress?.({ elapsed: 121, duration: 381 });
    const final = snapshot({
      elapsed: 122.75,
      duration: 382,
      checkpoint: true,
      playbackState: RelistenPlaybackState.Paused,
    });
    harness.nativeSnapshot?.(final);
    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        checkpoint: expect.objectContaining({ elapsedSeconds: 122.75, durationSeconds: 382 }),
      })
    );
    const count = harness.save.mock.calls.length;
    vi.advanceTimersByTime(10000);
    expect(harness.save).toHaveBeenCalledTimes(count);
  });

  it('rejects repeated and out-of-order progress and transition snapshots', () => {
    const stale = snapshot({ elapsed: 121, duration: 381 });
    harness.nativeTrack?.({ currentIdentifier: second.identifier });
    harness.nativeProgress?.({ elapsed: 4, duration: 410, checkpoint: true });
    const saved = harness.save.mock.calls.at(-1)?.[1];
    harness.nativeSnapshot?.(stale);
    harness.nativeSnapshot?.({ ...stale, sequence: 100, sourceTrackUuid: second.sourceTrack.uuid });
    expect(player.queue.currentTrack).toBe(second);
    expect(player.progress).toMatchObject({ elapsed: 4, duration: 410 });
    expect(harness.save.mock.calls.at(-1)?.[1]).toEqual(saved);
  });

  it('bounds progress persistence to five seconds without postponing the deadline', () => {
    harness.save.mockClear();
    for (let elapsed = 121; elapsed <= 125; elapsed++) {
      harness.nativeProgress?.({ elapsed, duration: 381 });
      vi.advanceTimersByTime(1000);
    }
    expect(harness.save).toHaveBeenCalledTimes(1);
    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ checkpoint: expect.objectContaining({ elapsedSeconds: 125 }) })
    );
  });

  it('keeps the selected entry and its timing through reorder and removal before it', () => {
    harness.nativeTrack?.({ currentIdentifier: second.identifier });
    harness.nativeProgress?.({ elapsed: 42, duration: 410 });
    player.queue.moveQueueTrack(1, 0);
    expect(player.queue.currentTrack).toBe(second);
    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        checkpoint: expect.objectContaining({ entryId: second.identifier, elapsedSeconds: 42 }),
      })
    );
    player.queue.moveQueueTrack(0, 1);
    player.queue.removeTrackAtIndex(0);
    expect(player.queue.currentTrack).toBe(second);
    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        checkpoint: expect.objectContaining({ entryId: second.identifier, elapsedSeconds: 42 }),
      })
    );
  });

  it('invalidates callbacks from a replaced queue even when entries are reused', () => {
    const stale = snapshot({ elapsed: 300, duration: 381 });
    player.queue.replaceQueue([first, second], undefined);
    harness.nativeSnapshot?.({ ...stale, sequence: 100 });
    expect(player.queue.currentTrack).toBeUndefined();
    expect(harness.save.mock.calls.at(-1)?.[1].checkpoint).toBeNull();
  });

  it('does not let a previous native session overwrite a newer explicit playback session', async () => {
    const old = snapshot({ elapsed: 300, duration: 381 });
    player.next();
    await Promise.resolve();
    await Promise.resolve();
    harness.nativeSnapshot?.({
      ...snapshot({
        identifier: second.identifier,
        sourceTrackUuid: second.sourceTrack.uuid,
        elapsed: 10,
        duration: 410,
      }),
      sessionId: 'new-session',
      sequence: 1,
    });
    harness.nativeSnapshot?.({ ...old, sequence: 999 });
    expect(player.queue.currentTrack).toBe(second);
    expect(player.progress?.elapsed).toBe(10);
  });

  it('retains the duplicate queue occurrence and shuffled order from Realm', async () => {
    harness.state.mockReturnValue(
      savedState({
        queueEntries: [
          { id: 'A1', sourceTrackUuid: 'minglewood' },
          { id: 'A2', sourceTrackUuid: 'minglewood' },
          { id: 'B', sourceTrackUuid: 'loser' },
        ],
        shuffleOrder: { entryIds: ['B', 'A2', 'A1'] },
        checkpoint: { entryId: 'A2', elapsedSeconds: 222, durationSeconds: 381 },
      })
    );
    const cachedRealm = {
      objects: () => ({ filtered: () => [first.sourceTrack, second.sourceTrack] }),
    } as unknown as Realm;
    await player.queue.restorePlayerState(cachedRealm);
    expect(player.queue.currentIndex).toBe(1);
    expect(player.queue.orderedTracks.map((track) => track.sourceTrack.uuid)).toEqual([
      'loser',
      'minglewood',
      'minglewood',
    ]);
    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        checkpoint: expect.objectContaining({
          entryId: 'A2',
          elapsedSeconds: 222,
        }),
      })
    );
  });
  it('keeps duplicate occurrences linked to original order after shuffled restore and advance', async () => {
    const third = track('third', 430);
    harness.state.mockReturnValue(
      savedState({
        queueEntries: [
          { id: 'A1', sourceTrackUuid: 'minglewood' },
          { id: 'B', sourceTrackUuid: 'loser' },
          { id: 'A2', sourceTrackUuid: 'minglewood' },
          { id: 'C', sourceTrackUuid: 'third' },
        ],
        shuffleOrder: { entryIds: ['A1', 'C', 'A2', 'B'] },
        checkpoint: { entryId: 'A1', elapsedSeconds: 222, durationSeconds: 381 },
      })
    );
    const cachedRealm = {
      objects: () => ({
        filtered: () => [first.sourceTrack, second.sourceTrack, third.sourceTrack],
      }),
    } as unknown as Realm;
    await player.queue.restorePlayerState(cachedRealm);
    expect(player.queue.orderedTracks.map((track) => track.identifier)).toEqual([
      'A1',
      'C',
      'A2',
      'B',
    ]);
    harness.nativeTrack?.({ currentIdentifier: 'A2' });
    player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_OFF);
    expect(player.queue.currentIndex).toBe(2);
    expect(player.queue.currentTrack?.identifier).toBe('A2');
    expect(player.queue.nextTrack?.identifier).toBe('C');
  });

  it('restores a queue without inventing a selection when its checkpoint is null', async () => {
    harness.state.mockReturnValue(savedState({ checkpoint: null }));
    const cachedRealm = {
      objects: () => ({ filtered: () => [first.sourceTrack, second.sourceTrack] }),
    } as unknown as Realm;
    await player.queue.restorePlayerState(cachedRealm);
    expect(player.queue.orderedTracks.map((track) => track.identifier)).toEqual(['A', 'B']);
    expect(player.queue.currentTrack).toBeUndefined();
    expect(harness.save.mock.calls.at(-1)?.[1].checkpoint).toBeNull();
    expect(harness.native.play).not.toHaveBeenCalled();
  });

  it('does not rewrite identical repeated native pause snapshots', () => {
    harness.nativeProgress?.({ elapsed: 122, duration: 381, checkpoint: true });
    const count = harness.save.mock.calls.length;
    harness.nativeProgress?.({ elapsed: 122, duration: 381, checkpoint: true });
    harness.nativeProgress?.({ elapsed: 122, duration: 381, checkpoint: true });
    expect(harness.save).toHaveBeenCalledTimes(count);
  });
  it('persists exactly one complete transition observation', () => {
    harness.save.mockClear();
    const event = snapshot({
      identifier: second.identifier,
      sourceTrackUuid: second.sourceTrack.uuid,
      elapsed: 42,
      duration: 410,
      checkpoint: true,
    });
    harness.nativeSnapshot?.(event);
    expect(harness.save).toHaveBeenCalledTimes(1);
    expect(harness.save.mock.calls[0][1]).toMatchObject({
      checkpoint: { entryId: second.identifier, elapsedSeconds: 42, durationSeconds: 410 },
    });
  });

  it('retains measured duration/position from identified Realm state', async () => {
    harness.state.mockReturnValue(
      savedState({
        checkpoint: { entryId: 'B', elapsedSeconds: 420, durationSeconds: 430 },
      })
    );
    const cachedRealm = {
      objects: () => ({ filtered: () => [first.sourceTrack, second.sourceTrack] }),
    } as unknown as Realm;
    await player.queue.restorePlayerState(cachedRealm);
    expect(player.progress).toMatchObject({ elapsed: 420, duration: 430 });
  });
  it('preserves reporting when confirmed playback crosses its eligibility threshold', () => {
    const report = vi.fn();
    player.onShouldReportTrack.addListener(report);
    harness.nativeProgress?.({ elapsed: 200, duration: 381 });
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0].playerQueueTrack).toBe(first);
  });
  it('does not apply a missing catalog entry timing to the remaining fallback track', async () => {
    const third = track('third', 430);
    harness.state.mockReturnValue(
      savedState({
        queueEntries: [
          { id: 'A', sourceTrackUuid: 'minglewood' },
          { id: 'B', sourceTrackUuid: 'loser' },
          { id: 'C', sourceTrackUuid: 'third' },
        ],
        shuffleOrder: { entryIds: ['C', 'A', 'B'] },
        checkpoint: { entryId: 'A', elapsedSeconds: 120, durationSeconds: 381 },
      })
    );
    const cachedRealm = {
      objects: () => ({ filtered: () => [second.sourceTrack, third.sourceTrack] }),
    } as unknown as Realm;
    await player.queue.restorePlayerState(cachedRealm);
    expect(player.queue.currentTrack?.identifier).toBe('C');
    expect(player.progress).toMatchObject({ elapsed: 0, duration: 430 });
    expect(harness.save.mock.calls.at(-1)?.[1].shuffleOrder.entryIds).toEqual(['C', 'B']);
  });
  it('does not erase a saved queue when native pause arrives before startup restore', () => {
    player.dispose();
    harness.save.mockClear();
    player = new RelistenPlayer();
    void player.state;
    state.setState(RelistenPlaybackState.Paused);
    player.queue.flushPlayerState();
    expect(harness.save).not.toHaveBeenCalled();
    expect(player.canRestorePlayerState).toBe(true);
  });
  it.each([
    [RelistenPlaybackState.Stopped, true],
    [RelistenPlaybackState.Paused, true],
    [RelistenPlaybackState.Playing, false],
    [RelistenPlaybackState.Stalled, false],
  ])(
    'only restores an untouched empty player in stopped/paused state: %s',
    (playbackState, allowed) => {
      player.dispose();
      state.setState(RelistenPlaybackState.Stopped);
      player = new RelistenPlayer();
      void player.state;
      state.setState(playbackState);
      expect(player.canRestorePlayerState).toBe(allowed);
      player.playbackIntentStarted = true;
      expect(player.canRestorePlayerState).toBe(false);
    }
  );
  it('starts the restored stream and seek intent after an unsolicited startup pause', async () => {
    player.dispose();
    state.setState(RelistenPlaybackState.Stopped);
    player = new RelistenPlayer();
    void player.state;
    state.setState(RelistenPlaybackState.Paused);
    harness.state.mockReturnValue(savedState());
    const cachedRealm = {
      objects: () => ({ filtered: () => [first.sourceTrack, second.sourceTrack] }),
    } as unknown as Realm;
    await player.queue.restorePlayerState(cachedRealm);
    expect(player.state).toBe(RelistenPlaybackState.Stopped);
    player.resume();
    await vi.waitFor(() => expect(harness.native.play).toHaveBeenCalled());
    expect(harness.native.play).toHaveBeenLastCalledWith(
      expect.objectContaining({ cacheKey: 'loser' }),
      120000
    );
  });

  it('confirms a restored selection so native preparation and later Next requests can proceed', async () => {
    player.dispose();
    currentTrackIdentifier.setState(undefined);
    state.setState(RelistenPlaybackState.Stopped);
    player = new RelistenPlayer();
    harness.state.mockReturnValue(
      savedState({ checkpoint: { entryId: 'A', elapsedSeconds: 120, durationSeconds: 381 } })
    );
    const cachedRealm = {
      objects: () => ({ filtered: () => [first.sourceTrack, second.sourceTrack] }),
    } as unknown as Realm;
    await player.queue.restorePlayerState(cachedRealm);
    expect(player.queue.nextTrack).toBeUndefined();

    player.resume();
    await vi.waitFor(() => expect(harness.native.play).toHaveBeenCalledTimes(1));
    harness.nativeSnapshot?.(snapshot({ identifier: 'A', elapsed: 120, duration: 381 }));
    expect(harness.native.setNextStream).toHaveBeenLastCalledWith(
      expect.objectContaining({ identifier: 'B' })
    );

    player.next();
    await vi.waitFor(() => expect(harness.native.play).toHaveBeenCalledTimes(2));
    expect(harness.native.play).toHaveBeenLastCalledWith(
      expect.objectContaining({ identifier: 'B' }),
      undefined
    );
  });

  it('applies pause, identity and timing from one observation before the final save', () => {
    harness.nativeSnapshot?.(
      snapshot({
        identifier: second.identifier,
        sourceTrackUuid: second.sourceTrack.uuid,
        elapsed: 7,
        duration: 410,
        playbackState: RelistenPlaybackState.Paused,
      })
    );
    expect(player.state).toBe(RelistenPlaybackState.Paused);
    expect(player.queue.currentTrack).toBe(second);
    expect(harness.save.mock.calls.at(-1)![1]).toMatchObject({
      checkpoint: { entryId: second.identifier, elapsedSeconds: 7, durationSeconds: 410 },
    });
  });

  it('applies a terminal stop without replacing the selected entry or its timing', () => {
    const stopped = snapshot({
      identifier: undefined,
      sourceTrackUuid: undefined,
      elapsed: undefined,
      duration: undefined,
      playbackState: RelistenPlaybackState.Stopped,
    });
    harness.nativeSnapshot?.(stopped);
    expect(player.state).toBe(RelistenPlaybackState.Stopped);
    expect(player.queue.currentTrack).toBe(first);
    expect(player.progress?.elapsed).toBe(120);
    expect(harness.save.mock.calls.at(-1)![1]).toMatchObject({
      checkpoint: { entryId: first.identifier, elapsedSeconds: 120 },
    });
    harness.nativeSnapshot?.({
      ...stopped,
      sequence: stopped.sequence - 1,
      playbackState: RelistenPlaybackState.Playing,
    });
    expect(player.state).toBe(RelistenPlaybackState.Stopped);
  });
  it('starts the selected stream after Android clears an already-paused controller', async () => {
    harness.nativeSnapshot?.(snapshot({ playbackState: RelistenPlaybackState.Paused }));
    harness.native.stop.mockImplementationOnce(async () => {
      // Android first captures the paused position, then reports the empty controller.
      harness.nativeSnapshot?.(
        snapshot({ playbackState: RelistenPlaybackState.Paused, checkpoint: true })
      );
      harness.nativeSnapshot?.(
        snapshot({
          identifier: undefined,
          sourceTrackUuid: undefined,
          elapsed: undefined,
          duration: undefined,
          playbackState: RelistenPlaybackState.Stopped,
          checkpoint: true,
        })
      );
    });
    await player.stop();
    expect(player.state).toBe(RelistenPlaybackState.Stopped);
    player.resume();
    await vi.waitFor(() => expect(harness.native.play).toHaveBeenCalled());
    expect(harness.native.play).toHaveBeenLastCalledWith(
      expect.objectContaining({ identifier: first.identifier }),
      undefined
    );
    expect(harness.native.resume).not.toHaveBeenCalled();
  });
});
