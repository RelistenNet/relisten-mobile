import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RelistenPlaybackSnapshot, RelistenStreamable } from '@/modules/relisten-audio-player';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  state: vi.fn(),
  snapshotListenerRemove: vi.fn(),
  native: {
    play: vi.fn<(stream: RelistenStreamable, startTimeMs?: number) => Promise<void>>(
      async () => {}
    ),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    seekTo: vi.fn(async () => {}),
    seekToTime: vi.fn(async () => {}),
    setNextStream: vi.fn<(stream?: RelistenStreamable) => void>(),
    setShuffleMode: vi.fn(),
    setRepeatMode: vi.fn(),
    addPlaybackSnapshotListener: vi.fn(),
  },
}));
vi.mock('@/modules/relisten-audio-player', () => ({
  nativePlayer: mocks.native,
  RelistenPlaybackErrorKind: { NetworkUnavailable: 'networkUnavailable' },
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
  PlayerState: { upsert: mocks.save, defaultObject: mocks.state, clear: vi.fn() },
}));
vi.mock('@/relisten/realm/models/source_track', () => ({ SourceTrack: class {} }));
vi.mock('@/relisten/offline/download_manager', () => ({ DownloadManager: {} }));
vi.mock('@/relisten/events', () => ({
  sharedStatsigClient: () => ({ logEvent: vi.fn() }),
  trackPlaybackErrorEvent: vi.fn(),
}));
vi.mock('@/relisten/util/logging', () => ({
  log: { debug: vi.fn(), extend: () => ({ debug: vi.fn(), warn: vi.fn() }) },
}));
vi.mock('react-native-flash-message', () => ({ showMessage: vi.fn() }));

import { RelistenPlaybackErrorKind, RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { RelistenPlayer } from './relisten_player';
import { PlayerQueueTrack, PlayerShuffleState } from './relisten_player_queue';
import type { PlayerStateProps } from '@/relisten/realm/models/player_state';
import { currentTrackIdentifier, latestError, progress, state } from './shared_state';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import type Realm from 'realm';
import { PlayerRepeatState } from './player_modes';

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

function savedState(overrides: Partial<PlayerStateProps> = {}): PlayerStateProps {
  return {
    queueEntries: [
      { id: 'A', sourceTrackUuid: 'minglewood' },
      { id: 'B', sourceTrackUuid: 'loser' },
    ],
    shuffleOrder: null,
    repeatMode: PlayerRepeatState.REPEAT_OFF,
    checkpoint: { entryId: 'B', elapsedSeconds: 120, durationSeconds: 410 },
    lastUpdatedAt: new Date(),
    ...overrides,
  };
}

/** Native delivery and persistence are mocked; the player and queue run unchanged. */
class PlaybackScenario {
  player: RelistenPlayer;
  readonly minglewood = track('minglewood', 381);
  readonly loser = track('loser', 410);
  private sequence = 0;
  private nativeIdentifier: string | undefined;
  private listener!: (snapshot: RelistenPlaybackSnapshot) => void;

  constructor() {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.state.mockReset();
    mocks.native.addPlaybackSnapshotListener.mockImplementation((listener) => {
      this.listener = listener;
      return { remove: mocks.snapshotListenerRemove };
    });
    currentTrackIdentifier.setState(undefined);
    state.setState(RelistenPlaybackState.Stopped);
    this.player = new RelistenPlayer();
    void this.player.state;
  }

  startPlayingQueue() {
    this.player.queue.replaceQueue([this.minglewood, this.loser], undefined);
    this.emit({ identifier: this.minglewood.identifier, elapsed: 120, duration: 381 });
  }

  capture(overrides: Partial<RelistenPlaybackSnapshot> = {}): RelistenPlaybackSnapshot {
    const identifier = overrides.identifier ?? this.nativeIdentifier;
    const selectedTrack = this.player.queue.orderedTracks.find(
      (track) => track.identifier === identifier
    );
    return {
      sessionId: 'native-test',
      sequence: ++this.sequence,
      identifier,
      sourceTrackUuid: selectedTrack?.sourceTrack.uuid,
      playbackState: RelistenPlaybackState.Playing,
      checkpoint: false,
      ...overrides,
    };
  }

  emit(overrides: Partial<RelistenPlaybackSnapshot>) {
    const snapshot = this.capture(overrides);
    this.nativeIdentifier = snapshot.identifier;
    this.deliver(snapshot);
  }

  // Captured events can be delivered later to exercise stale and reordered callbacks.
  deliver(snapshot: RelistenPlaybackSnapshot) {
    this.listener(snapshot);
  }

  restore(
    overrides: Partial<PlayerStateProps> = {},
    catalog = [this.minglewood.sourceTrack, this.loser.sourceTrack]
  ) {
    mocks.state.mockReturnValue(savedState(overrides));
    const cachedRealm = {
      objects: () => ({ filtered: () => catalog }),
    } as unknown as Realm;
    return this.player.queue.restorePlayerState(cachedRealm);
  }

  get savedState(): PlayerStateProps {
    return mocks.save.mock.lastCall![1];
  }

  get savedCheckpoint() {
    return this.savedState.checkpoint;
  }

  get lastNativePlay() {
    const [stream, startTimeMs] = mocks.native.play.mock.lastCall!;
    return { entryId: stream.identifier, sourceTrackUuid: stream.cacheKey, startTimeMs };
  }

  dispose() {
    this.player.dispose();
    vi.clearAllTimers();
    vi.useRealTimers();
  }
}

function deferredOperation() {
  let complete!: () => void;
  const promise = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return { promise, complete };
}

let scenario: PlaybackScenario;
let player: RelistenPlayer;
let minglewood: PlayerQueueTrack;
let loser: PlayerQueueTrack;

beforeEach(() => {
  scenario = new PlaybackScenario();
  ({ player, minglewood, loser } = scenario);
});

afterEach(() => scenario.dispose());

describe('native requests and confirmation', () => {
  beforeEach(() => scenario.startPlayingQueue());

  it('queues the next request when native auto-advance arrives before the pending pause resolves', async () => {
    player.queue.addTrackToEndOfQueue([track('third', 430)]);
    const third = player.queue.orderedTracks[2];
    let finishPause!: () => void;
    const pendingPause = new Promise<void>((resolve) => {
      finishPause = resolve;
    });
    mocks.native.pause.mockImplementationOnce(() => pendingPause);

    player.next();
    expect(mocks.native.pause).toHaveBeenCalledTimes(1);
    expect(mocks.native.play).not.toHaveBeenCalled();

    // Native reaches the requested track before its pause and play request have run.
    scenario.emit({ identifier: loser.identifier });
    player.playTrackAtIndex(2);
    expect(mocks.native.pause).toHaveBeenCalledTimes(1);

    finishPause();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));
    expect(scenario.lastNativePlay).toMatchObject({
      entryId: third.identifier,
      startTimeMs: undefined,
    });
  });

  it('follows an unexpected native transition after the play request is issued', async () => {
    player.queue.addTrackToEndOfQueue([track('third', 430)]);
    const third = player.queue.orderedTracks[2];

    player.next();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));

    scenario.emit({ identifier: third.identifier });

    expect(player.queue.currentTrack).toBe(third);
    expect(progress.lastState()).toEqual({ elapsed: 0, duration: 430, percent: 0 });
  });

  it('resets progress for a native automatic track change', () => {
    scenario.emit({ identifier: loser.identifier });
    vi.advanceTimersByTime(1000);

    expect(scenario.savedCheckpoint).toMatchObject({
      entryId: loser.identifier,
      durationSeconds: 410,
      elapsedSeconds: 0,
    });
  });

  it('ignores a duplicated previous-track progress event after an automatic change', () => {
    const stale = scenario.capture({
      elapsed: 121,
      duration: 381,
      identifier: minglewood.identifier,
    });
    scenario.emit({ identifier: loser.identifier });

    // The final progress event from the previous track arrives after the transition.
    scenario.deliver(stale);
    expect(progress.lastState()).toEqual({ elapsed: 0, duration: 410, percent: 0 });
    expect(player.progress).toMatchObject({ elapsed: 0, duration: 410 });

    scenario.emit({ elapsed: 1, duration: 410 });
    expect(progress.lastState()).toEqual({ elapsed: 1, duration: 410, percent: 1 / 410 });
  });

  it('uses a fallback duration when an automatic track has no catalog duration', () => {
    loser.sourceTrack.duration = 0;
    scenario.emit({ identifier: loser.identifier });

    expect(progress.lastState()).toEqual({ elapsed: 0, duration: 100, percent: 0 });
  });

  it('accepts identified current-track progress after an automatic change', () => {
    scenario.emit({ identifier: loser.identifier });
    vi.advanceTimersByTime(5001);

    scenario.emit({ elapsed: 121, duration: 381 });
    expect(progress.lastState()).toEqual({ elapsed: 121, duration: 381, percent: 121 / 381 });
  });

  it('preserves confirmed native timing on repeated same-track notifications', () => {
    scenario.emit({ elapsed: 130, duration: 382.25 });
    player.queue.onCurrentTrackIdentifierChanged(minglewood.identifier);
    vi.advanceTimersByTime(1000);

    expect(player.progress).toMatchObject({ elapsed: 130, duration: 382.25 });
    expect(scenario.savedCheckpoint).toMatchObject({
      entryId: minglewood.identifier,
      durationSeconds: 382.25,
      elapsedSeconds: 130,
    });
  });

  it('removes native event listeners when disposed', () => {
    player.dispose();

    expect(mocks.snapshotListenerRemove).toHaveBeenCalledTimes(1);
  });

  it('ignores previous-track callbacks and progress while a new track is pending', () => {
    player.next();
    scenario.emit({ identifier: minglewood.identifier });
    state.setState(RelistenPlaybackState.Playing);
    scenario.emit({ elapsed: 121, duration: 381 });

    expect(player.progress).toMatchObject({ duration: 381, elapsed: 121 });
    expect(progress.lastState()).toMatchObject({ duration: 410, elapsed: 0 });
    scenario.emit({ identifier: loser.identifier });
    state.setState(RelistenPlaybackState.Playing);
    player.pause();
    vi.advanceTimersByTime(1000);

    expect(scenario.savedCheckpoint).toMatchObject({
      entryId: loser.identifier,
      durationSeconds: 410,
      elapsedSeconds: 0,
    });
  });

  it('commits an interruption snapshot immediately and cancels older pending work', () => {
    scenario.emit({ elapsed: 121, duration: 381 });
    const final = scenario.capture({
      elapsed: 122.75,
      duration: 382,
      checkpoint: true,
      playbackState: RelistenPlaybackState.Paused,
    });
    scenario.deliver(final);
    expect(scenario.savedCheckpoint).toMatchObject({
      elapsedSeconds: 122.75,
      durationSeconds: 382,
    });
    const count = mocks.save.mock.calls.length;
    vi.advanceTimersByTime(10000);
    expect(mocks.save).toHaveBeenCalledTimes(count);
  });

  it('does not let a previous native session overwrite a newer explicit playback session', async () => {
    const old = scenario.capture({ elapsed: 300, duration: 381 });
    player.next();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));
    scenario.emit({
      identifier: loser.identifier,
      elapsed: 10,
      duration: 410,
      sessionId: 'new-session',
      sequence: 1,
    });
    scenario.deliver({ ...old, sequence: 999 });
    expect(player.queue.currentTrack).toBe(loser);
    expect(player.progress?.elapsed).toBe(10);
  });
});

describe('commands interrupted by later user actions', () => {
  beforeEach(() => scenario.startPlayingQueue());

  it.each(['pause', 'togglePauseResume'] as const)(
    'honors Pause through %s while Next is still waiting for native pause',
    async (action) => {
      const pause = deferredOperation();
      mocks.native.pause.mockReturnValueOnce(pause.promise);
      const selection = vi.fn();
      const playbackState = vi.fn();
      player.queue.onCurrentTrackChanged.addListener(selection);
      player.onStateChanged.addListener(playbackState);
      player.next();
      expect(selection).toHaveBeenLastCalledWith(loser);

      player[action]();
      expect(playbackState).toHaveBeenLastCalledWith(RelistenPlaybackState.Paused);
      expect(selection).toHaveBeenLastCalledWith(minglewood);
      expect(progress.lastState()?.elapsed).toBe(120);
      pause.complete();
      await vi.advanceTimersByTimeAsync(0);

      expect(player.state).toBe(RelistenPlaybackState.Paused);
      expect(mocks.native.play).not.toHaveBeenCalled();
      player.resume();
      expect(mocks.native.resume).toHaveBeenCalledTimes(1);
    }
  );

  it('does not let a canceled pause completion release a newer Play request', async () => {
    const oldPause = deferredOperation();
    mocks.native.pause.mockReturnValueOnce(oldPause.promise);
    player.next();
    await player.stop();

    const newPlay = deferredOperation();
    mocks.native.play.mockReturnValueOnce(newPlay.promise);
    player.resume();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));

    oldPause.complete();
    await vi.advanceTimersByTimeAsync(0);
    player.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.native.play).toHaveBeenCalledTimes(1);

    scenario.emit({ identifier: minglewood.identifier });
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(2));
    expect(scenario.lastNativePlay.entryId).toBe(loser.identifier);
    newPlay.complete();
  });

  it('keeps the pending target when a different entry reports a native error', async () => {
    player.queue.addTrackToEndOfQueue([track('third', 430)]);
    const third = player.queue.orderedTracks[2];
    const pause = deferredOperation();
    mocks.native.pause.mockReturnValueOnce(pause.promise);
    player.next();
    const failure = {
      identifier: minglewood.identifier,
      error: {
        kind: RelistenPlaybackErrorKind.NetworkUnavailable,
        message: 'Previous stream failed',
        isRetryable: true,
        platform: 'ios' as const,
      },
    };
    latestError.setState(failure);
    pause.complete();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));
    expect(scenario.lastNativePlay.entryId).toBe(loser.identifier);

    latestError.setState({ ...failure });
    player.playTrackAtIndex(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.native.play).toHaveBeenCalledTimes(1);
    scenario.emit({ identifier: loser.identifier });
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(2));
    expect(scenario.lastNativePlay.entryId).toBe(third.identifier);
  });

  it('does not let an old error for a restarted entry release its unfinished command', async () => {
    await player.stop();
    const restartedPlay = deferredOperation();
    mocks.native.play.mockReturnValueOnce(restartedPlay.promise);
    player.resume();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));

    latestError.setState({
      identifier: minglewood.identifier,
      error: {
        kind: RelistenPlaybackErrorKind.NetworkUnavailable,
        message: 'Delayed failure for the same queue occurrence',
        isRetryable: true,
        platform: 'ios',
      },
    });
    player.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.native.play).toHaveBeenCalledTimes(1);

    restartedPlay.complete();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(2));
    expect(scenario.lastNativePlay.entryId).toBe(loser.identifier);
  });

  it('keeps a queued Play target through drag reordering', async () => {
    player.queue.addTrackToEndOfQueue([track('third', 430)]);
    const third = player.queue.orderedTracks[2];
    const pause = deferredOperation();
    mocks.native.pause.mockReturnValueOnce(pause.promise);
    player.next();
    player.playTrackAtIndex(2);

    player.queue.moveQueueTrack(2, 0);
    pause.complete();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));

    expect(scenario.lastNativePlay.entryId).toBe(third.identifier);
  });
});

describe('progress publication and listening history', () => {
  beforeEach(() => scenario.startPlayingQueue());

  it('publishes corrected native duration at the same paused elapsed time', () => {
    player.pause();
    scenario.emit({ elapsed: 120, duration: 382.25, playbackState: RelistenPlaybackState.Paused });

    expect(progress.lastState()).toEqual({ elapsed: 120, duration: 382.25, percent: 120 / 382.25 });
    expect(player.progress).toEqual(progress.lastState());
  });

  it('keeps current native timing for immediate saves while publishing progress once per second', () => {
    scenario.emit({ elapsed: 120.1, duration: 381, checkpoint: true });
    scenario.emit({ elapsed: 120.35, duration: 381 });
    scenario.emit({ elapsed: 120.8, duration: 381 });
    expect(progress.lastState()?.elapsed).toBe(120.1);
    expect(player.progress?.elapsed).toBe(120.8);
    player.pause();
    expect(scenario.savedCheckpoint?.elapsedSeconds).toBe(120.8);
    scenario.emit({ elapsed: 121.1, duration: 381 });
    expect(progress.lastState()?.elapsed).toBe(121.1);
  });

  it('reports a listening threshold crossed between UI progress updates', () => {
    const report = vi.fn();
    player.onShouldReportTrack.addListener(report);
    // Halfway is 185.6 seconds, between two samples in the same displayed second.
    scenario.emit({ elapsed: 185.2, duration: 371.2 });
    scenario.emit({ elapsed: 185.8, duration: 371.2 });
    expect(progress.lastState()?.elapsed).toBe(185.2);
    expect(report).toHaveBeenCalledTimes(1);
    scenario.emit({ elapsed: 186.1, duration: 371.2 });
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('keeps confirmed timing when native reports a transient invalid duration', () => {
    player.pause();
    scenario.emit({
      elapsed: 120,
      duration: undefined,
      playbackState: RelistenPlaybackState.Paused,
    });

    expect(progress.lastState()).toEqual({ elapsed: 120, duration: 381, percent: 120 / 381 });
    expect(player.progress).toEqual(progress.lastState());
  });

  it('preserves reporting when confirmed playback crosses its eligibility threshold', () => {
    const report = vi.fn();
    player.onShouldReportTrack.addListener(report);
    scenario.emit({ elapsed: 200, duration: 381 });
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0].playerQueueTrack).toBe(minglewood);
  });
});

describe('checkpoint persistence and queue edits', () => {
  beforeEach(() => scenario.startPlayingQueue());

  it.each(['queueNextTrack', 'addTrackToEndOfQueue'] as const)(
    'can undo one returned occurrence after adding the same track twice: %s',
    (insert) => {
      player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_ON);
      const [firstAdded, secondAdded] = player.queue[insert]([minglewood, minglewood]);

      expect(firstAdded.identifier).not.toBe(minglewood.identifier);
      expect(secondAdded.identifier).not.toBe(firstAdded.identifier);
      expect(player.queue.removeTrackWithIdentifier(firstAdded.identifier)).toBe(true);

      for (const shuffleState of [PlayerShuffleState.SHUFFLE_ON, PlayerShuffleState.SHUFFLE_OFF]) {
        player.queue.setShuffleState(shuffleState);
        expect(player.queue.orderedTracks).toHaveLength(3);
        expect(player.queue.orderedTracks).toContain(minglewood);
        expect(player.queue.orderedTracks).toContain(secondAdded);
        expect(player.queue.orderedTracks).not.toContain(firstAdded);
        expect(player.queue.currentTrack).toBe(minglewood);
      }
      expect(player.state).toBe(RelistenPlaybackState.Playing);
      expect(mocks.native.stop).not.toHaveBeenCalled();
    }
  );

  it.each(['Play Next', 'Add to End'] as const)(
    'preserves re-enqueued occurrences and the playing checkpoint after restore: %s',
    async (action) => {
      const playingIdentifier = minglewood.identifier;
      player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_ON);

      // Queue menus can pass the same existing entry on every invocation.
      if (action === 'Play Next') {
        player.queue.queueNextTrack([minglewood, minglewood]);
      } else {
        player.queue.addTrackToEndOfQueue([minglewood, minglewood]);
      }
      // Exercise a playback order that differs from the original order.
      player.queue.moveQueueTrack(1, 3);
      const expectedOrder = player.queue.orderedTracks.map((entry) => entry.identifier);
      const saved = scenario.savedState;
      expect(player.queue.currentTrack).toBe(minglewood);
      expect(minglewood.identifier).toBe(playingIdentifier);
      expect(scenario.savedCheckpoint).toMatchObject({
        entryId: playingIdentifier,
        elapsedSeconds: 120,
      });

      scenario.dispose();
      scenario = new PlaybackScenario();
      player = scenario.player;
      await scenario.restore(saved);

      expect(player.queue.orderedTracks).toHaveLength(4);
      expect(player.queue.orderedTracks.map((entry) => entry.identifier)).toEqual(expectedOrder);
      expect(new Set(expectedOrder).size).toBe(4);
      expect(player.queue.currentTrack?.identifier).toBe(playingIdentifier);
      expect(player.progress?.elapsed).toBe(120);

      player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_OFF);
      expect(player.queue.orderedTracks.map((entry) => entry.identifier)).toEqual(
        saved.queueEntries.map((entry) => entry.id)
      );
    }
  );

  it.each([RelistenPlaybackState.Playing, RelistenPlaybackState.Paused])(
    'stops native playback when the selected entry is removed while %s',
    async (playbackState) => {
      scenario.emit({ playbackState });
      const removedSnapshot = scenario.capture({ elapsed: 121, duration: 381 });

      player.queue.removeTrackAtIndex(0);
      expect(mocks.native.stop).toHaveBeenCalledTimes(1);
      expect(player.state).toBe(RelistenPlaybackState.Stopped);
      expect(player.queue.currentTrack).toBeUndefined();
      expect(player.queue.orderedTracks).toEqual([loser]);
      expect(player.queue.nextTrack).toBeUndefined();
      expect(scenario.savedCheckpoint).toBeNull();
      scenario.deliver(removedSnapshot);
      expect(player.state).toBe(RelistenPlaybackState.Stopped);

      player.resume();
      await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));
      expect(scenario.lastNativePlay).toMatchObject({
        entryId: loser.identifier,
        startTimeMs: undefined,
      });
      scenario.emit({ identifier: loser.identifier, elapsed: 3, duration: 410 });
      expect(player.progress?.elapsed).toBe(3);
    }
  );

  it('removes the displayed occurrence when shuffled order differs from original order', () => {
    player.queue.addTrackToEndOfQueue([track('third', 430)]);
    const third = player.queue.orderedTracks[2];
    player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_ON);
    const thirdIndex = player.queue.orderedTracks.indexOf(third);
    player.queue.moveQueueTrack(thirdIndex, 1);

    player.queue.removeTrackAtIndex(1);
    expect(player.queue.orderedTracks).toEqual([minglewood, loser]);
    expect(player.queue.currentTrack).toBe(minglewood);
    expect(mocks.native.stop).not.toHaveBeenCalled();
    player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_OFF);
    expect(player.queue.orderedTracks).toEqual([minglewood, loser]);
  });

  it('cancels a removed pending target and can resume the retained entry and its successor', async () => {
    player.queue.addTrackToEndOfQueue([track('third', 430)]);
    const third = player.queue.orderedTracks[2];
    const pause = deferredOperation();
    mocks.native.pause.mockReturnValueOnce(pause.promise);
    player.next();

    player.queue.removeTrackAtIndex(1);
    pause.complete();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.native.play).not.toHaveBeenCalled();
    expect(mocks.native.stop).toHaveBeenCalledTimes(1);
    expect(player.state).toBe(RelistenPlaybackState.Stopped);
    expect(player.queue.currentTrack).toBe(minglewood);

    player.resume();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));
    expect(scenario.lastNativePlay).toMatchObject({
      entryId: minglewood.identifier,
      startTimeMs: 120000,
    });
    scenario.emit({ identifier: minglewood.identifier, elapsed: 120, duration: 381 });
    const [preparedStream] = mocks.native.setNextStream.mock.lastCall!;
    expect(preparedStream?.identifier).toBe(third.identifier);
    player.next();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(2));
    expect(scenario.lastNativePlay.entryId).toBe(third.identifier);
  });

  it('stops and persists an empty queue when its last selected entry is removed', () => {
    player.queue.removeTrackAtIndex(1);
    player.queue.removeTrackAtIndex(0);

    expect(mocks.native.stop).toHaveBeenCalledTimes(1);
    expect(player.state).toBe(RelistenPlaybackState.Stopped);
    expect(player.queue.orderedTracks).toEqual([]);
    expect(scenario.savedState.queueEntries).toEqual([]);
    expect(scenario.savedCheckpoint).toBeNull();
    player.resume();
    expect(mocks.native.play).not.toHaveBeenCalled();
  });

  it('saves the new track with its own progress when paused before native progress arrives', async () => {
    player.next();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));
    scenario.emit({ identifier: loser.identifier });
    state.setState(RelistenPlaybackState.Playing);
    player.pause();
    vi.advanceTimersByTime(1000);

    expect(scenario.savedCheckpoint).toMatchObject({
      entryId: loser.identifier,
      durationSeconds: 410,
      elapsedSeconds: 0,
    });
  });

  it('keeps confirmed track progress coherent when a save fires before the next track is confirmed', () => {
    player.next();
    vi.advanceTimersByTime(5000);

    expect(scenario.savedCheckpoint).toMatchObject({
      entryId: minglewood.identifier,
      durationSeconds: 381,
      elapsedSeconds: 120,
    });
  });

  it('rejects repeated and out-of-order progress and transition snapshots', () => {
    const stale = scenario.capture({ elapsed: 121, duration: 381 });
    scenario.emit({ identifier: loser.identifier });
    scenario.emit({ elapsed: 4, duration: 410, checkpoint: true });
    const saved = scenario.savedState;
    scenario.deliver(stale);
    scenario.deliver({ ...stale, sequence: 100, sourceTrackUuid: loser.sourceTrack.uuid });
    expect(player.queue.currentTrack).toBe(loser);
    expect(player.progress).toMatchObject({ elapsed: 4, duration: 410 });
    expect(scenario.savedState).toEqual(saved);
  });

  it('bounds progress persistence to five seconds without postponing the deadline', () => {
    mocks.save.mockClear();
    for (let elapsed = 121; elapsed <= 125; elapsed++) {
      scenario.emit({ elapsed, duration: 381 });
      vi.advanceTimersByTime(1000);
    }
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(scenario.savedCheckpoint).toMatchObject({ elapsedSeconds: 125 });
  });

  it('keeps the selected entry and its timing through reorder and removal before it', () => {
    scenario.emit({ identifier: loser.identifier });
    scenario.emit({ elapsed: 42, duration: 410 });
    player.queue.moveQueueTrack(1, 0);
    expect(player.queue.currentTrack).toBe(loser);
    expect(scenario.savedCheckpoint).toMatchObject({
      entryId: loser.identifier,
      elapsedSeconds: 42,
    });
    player.queue.moveQueueTrack(0, 1);
    player.queue.removeTrackAtIndex(0);
    expect(player.queue.currentTrack).toBe(loser);
    expect(scenario.savedCheckpoint).toMatchObject({
      entryId: loser.identifier,
      elapsedSeconds: 42,
    });
  });

  it('invalidates callbacks from a replaced queue even when entries are reused', () => {
    const stale = scenario.capture({ elapsed: 300, duration: 381 });
    player.queue.replaceQueue([minglewood, loser], undefined);
    scenario.deliver({ ...stale, sequence: 100 });
    expect(player.queue.currentTrack).toBeUndefined();
    expect(scenario.savedCheckpoint).toBeNull();
  });

  it('does not rewrite identical repeated native pause snapshots', () => {
    scenario.emit({ elapsed: 122, duration: 381, checkpoint: true });
    const count = mocks.save.mock.calls.length;
    scenario.emit({ elapsed: 122, duration: 381, checkpoint: true });
    scenario.emit({ elapsed: 122, duration: 381, checkpoint: true });
    expect(mocks.save).toHaveBeenCalledTimes(count);
  });

  it('persists exactly one complete transition observation', () => {
    mocks.save.mockClear();
    const event = scenario.capture({
      identifier: loser.identifier,
      sourceTrackUuid: loser.sourceTrack.uuid,
      elapsed: 42,
      duration: 410,
      checkpoint: true,
    });
    scenario.deliver(event);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(scenario.savedState).toMatchObject({
      checkpoint: { entryId: loser.identifier, elapsedSeconds: 42, durationSeconds: 410 },
    });
  });

  it('applies pause, identity and timing from one observation before the final save', () => {
    scenario.emit({
      identifier: loser.identifier,
      elapsed: 7,
      duration: 410,
      playbackState: RelistenPlaybackState.Paused,
    });
    expect(player.state).toBe(RelistenPlaybackState.Paused);
    expect(player.queue.currentTrack).toBe(loser);
    expect(scenario.savedState).toMatchObject({
      checkpoint: { entryId: loser.identifier, elapsedSeconds: 7, durationSeconds: 410 },
    });
  });
});

describe('seeking', () => {
  it.each(['fraction', 'seconds'] as const)(
    'saves a stopped %s seek and starts the restored entry at that position',
    async (unit) => {
      await scenario.restore();

      if (unit === 'fraction') {
        await player.seekTo(0.5);
      } else {
        await player.seekToTime(205);
      }
      vi.advanceTimersByTime(1000);

      expect(player.state).toBe(RelistenPlaybackState.Stopped);
      expect(progress.lastState()).toEqual({ elapsed: 205, duration: 410, percent: 0.5 });
      expect(scenario.savedCheckpoint).toEqual({
        entryId: 'B',
        elapsedSeconds: 205,
        durationSeconds: 410,
      });
      expect(mocks.native.seekTo).not.toHaveBeenCalled();
      expect(mocks.native.seekToTime).not.toHaveBeenCalled();
      expect(mocks.native.play).not.toHaveBeenCalled();

      player.resume();
      await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));
      expect(scenario.lastNativePlay).toMatchObject({ entryId: 'B', startTimeMs: 205000 });
    }
  );

  it('resumes from confirmed progress after explicitly playing a previously sought entry', async () => {
    await scenario.restore();
    await player.seekToTime(205);

    player.playTrackAtIndex(1);
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));
    scenario.emit({ identifier: 'B', elapsed: 20, duration: 410 });
    await vi.advanceTimersByTimeAsync(0);
    expect(player.progress).toMatchObject({ elapsed: 20, duration: 410 });

    await player.stop();
    expect(scenario.savedCheckpoint).toMatchObject({ entryId: 'B', elapsedSeconds: 20 });
    player.resume();

    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(2));
    expect(scenario.lastNativePlay).toMatchObject({ entryId: 'B', startTimeMs: 20000 });
  });

  it('keeps a pending entry seek preview out of the confirmed checkpoint', async () => {
    scenario.startPlayingQueue();
    const pause = deferredOperation();
    mocks.native.pause.mockImplementationOnce(() => pause.promise);

    player.next();
    await player.seekTo(0.5);
    vi.advanceTimersByTime(1000);

    expect(progress.lastState()).toEqual({ elapsed: 205, duration: 410, percent: 0.5 });
    expect(player.progress).toMatchObject({ elapsed: 120, duration: 381 });
    expect(scenario.savedCheckpoint).toMatchObject({
      entryId: minglewood.identifier,
      elapsedSeconds: 120,
      durationSeconds: 381,
    });
  });

  it('starts a pending entry at the latest seek without seeking the preceding native item', async () => {
    scenario.startPlayingQueue();
    const pause = deferredOperation();
    mocks.native.pause.mockImplementationOnce(() => pause.promise);

    player.next();
    await player.seekTo(0.25);
    await player.seekToTime(205);
    scenario.emit({ elapsed: 121, duration: 381 });

    expect(mocks.native.seekTo).not.toHaveBeenCalled();
    expect(mocks.native.seekToTime).not.toHaveBeenCalled();
    expect(progress.lastState()).toMatchObject({ elapsed: 205, duration: 410 });
    expect(player.progress).toMatchObject({ elapsed: 121, duration: 381 });

    pause.complete();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));
    expect(scenario.lastNativePlay).toMatchObject({
      entryId: loser.identifier,
      startTimeMs: 205000,
    });
  });

  it('retains a seek while the first play is still stopped', async () => {
    await scenario.restore();
    player.playTrackAtIndex(1);
    await player.seekTo(0.5);

    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));
    expect(scenario.lastNativePlay).toMatchObject({ entryId: 'B', startTimeMs: 205000 });
    expect(mocks.native.seekTo).not.toHaveBeenCalled();
    expect(mocks.native.seekToTime).not.toHaveBeenCalled();
  });

  it.each(['before', 'after'] as const)(
    'serializes a seek when native confirmation arrives %s the play promise settles',
    async (confirmationOrder) => {
      scenario.startPlayingQueue();
      const play = deferredOperation();
      mocks.native.play.mockImplementationOnce(() => play.promise);
      player.next();
      await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));
      await player.seekToTime(205);

      expect(mocks.native.seekToTime).not.toHaveBeenCalled();
      if (confirmationOrder === 'before') {
        scenario.emit({ identifier: loser.identifier, elapsed: 0, duration: 410 });
      }
      play.complete();
      if (confirmationOrder === 'after') {
        await vi.advanceTimersByTimeAsync(0);
        expect(mocks.native.seekToTime).not.toHaveBeenCalled();
        scenario.emit({ identifier: loser.identifier, elapsed: 0, duration: 410 });
      }

      await vi.waitFor(() => expect(mocks.native.seekToTime).toHaveBeenCalledWith(205000));
      expect(mocks.native.play).toHaveBeenCalledTimes(1);
      expect(scenario.savedCheckpoint).toMatchObject({
        entryId: loser.identifier,
        elapsedSeconds: 205,
        durationSeconds: 410,
      });
    }
  );

  it('preserves a newer queued selection when seeking an older preview', async () => {
    scenario.startPlayingQueue();
    player.queue.addTrackToEndOfQueue([track('third', 430)]);
    const third = player.queue.orderedTracks[2];
    const pause = deferredOperation();
    mocks.native.pause.mockImplementationOnce(() => pause.promise);

    player.next();
    player.playTrackAtIndex(2);
    await player.seekTo(0.5);
    pause.complete();

    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));
    expect(scenario.lastNativePlay).toMatchObject({
      entryId: third.identifier,
      startTimeMs: undefined,
    });
    expect(mocks.native.seekTo).not.toHaveBeenCalled();
    expect(mocks.native.seekToTime).not.toHaveBeenCalled();
  });

  it('applies a seek after auto-advance without releasing an unresolved pause', async () => {
    scenario.startPlayingQueue();
    const pause = deferredOperation();
    mocks.native.pause.mockImplementationOnce(() => pause.promise);

    player.next();
    scenario.emit({ identifier: loser.identifier, elapsed: 0, duration: 410 });
    await player.seekTo(0.5);
    expect(mocks.native.seekToTime).not.toHaveBeenCalled();
    pause.complete();

    await vi.waitFor(() => expect(mocks.native.seekToTime).toHaveBeenCalledWith(205000));
    expect(mocks.native.play).not.toHaveBeenCalled();
    expect(player.progress).toMatchObject({ elapsed: 205, duration: 410 });
  });

  it('honors an explicit time when replaying the current playing entry', async () => {
    scenario.startPlayingQueue();
    player.playTrackAtIndex(0, 205);

    await vi.waitFor(() => expect(mocks.native.seekToTime).toHaveBeenCalledWith(205000));
    expect(mocks.native.seekTo).not.toHaveBeenCalled();
    expect(mocks.native.play).not.toHaveBeenCalled();
  });

  it('keeps the fractional and absolute driver contracts without resuming paused playback', async () => {
    scenario.startPlayingQueue();
    scenario.emit({ playbackState: RelistenPlaybackState.Paused });
    const driver = {
      name: 'cast',
      isActive: () => true,
      play: vi.fn(async () => {}),
      pause: vi.fn(async () => {}),
      resume: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      seekTo: vi.fn(async () => {}),
      seekToTime: vi.fn(async () => {}),
      setNextStream: vi.fn(),
    };
    player.setPlaybackDriver(driver);

    await player.seekTo(0.5);
    await player.seekToTime(500);
    vi.advanceTimersByTime(1000);

    expect(driver.seekTo).toHaveBeenCalledWith(0.5);
    expect(driver.seekToTime).toHaveBeenCalledWith(500000);
    expect(driver.resume).not.toHaveBeenCalled();
    expect(player.state).toBe(RelistenPlaybackState.Paused);
    expect(progress.lastState()?.elapsed).toBe(500);
  });
});

describe('saved queue restoration', () => {
  it('does not transfer a removed restored entry seek to the next entry', async () => {
    await scenario.restore({
      checkpoint: { entryId: 'A', elapsedSeconds: 120, durationSeconds: 381 },
    });
    player.queue.removeTrackAtIndex(0);

    player.resume();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));
    expect(scenario.lastNativePlay).toEqual({
      entryId: 'B',
      sourceTrackUuid: 'loser',
      startTimeMs: undefined,
    });
  });

  it.each([
    {
      reason: 'prefers saved native duration',
      catalogDuration: 410,
      savedDuration: 381,
      savedElapsed: 120,
      expectedDuration: 381,
      expectedElapsed: 120,
    },
    {
      reason: 'clamps elapsed to known duration',
      catalogDuration: 410,
      savedDuration: 381,
      savedElapsed: 500,
      expectedDuration: 381,
      expectedElapsed: 381,
    },
    {
      reason: 'uses catalog duration when saved duration is absent',
      catalogDuration: 410,
      savedDuration: undefined,
      savedElapsed: 120,
      expectedDuration: 410,
      expectedElapsed: 120,
    },
    {
      reason: 'keeps saved duration when catalog duration is zero',
      catalogDuration: 0,
      savedDuration: 381,
      savedElapsed: 120,
      expectedDuration: 381,
      expectedElapsed: 120,
    },
    {
      reason: 'keeps saved duration when catalog duration is absent',
      catalogDuration: undefined,
      savedDuration: 381,
      savedElapsed: 120,
      expectedDuration: 381,
      expectedElapsed: 120,
    },
  ])(
    '$reason',
    async ({ catalogDuration, savedDuration, savedElapsed, expectedDuration, expectedElapsed }) => {
      loser.sourceTrack.duration = catalogDuration;

      await scenario.restore({
        checkpoint: { entryId: 'B', elapsedSeconds: savedElapsed, durationSeconds: savedDuration },
      });

      expect(player.queue.currentTrack?.sourceTrack.uuid).toBe('loser');
      expect(player.progress).toEqual({
        duration: expectedDuration,
        elapsed: expectedElapsed,
        percent: expectedElapsed / expectedDuration,
      });
      expect(scenario.savedCheckpoint).toMatchObject({
        durationSeconds: expectedDuration,
        elapsedSeconds: expectedElapsed,
      });
      expect(mocks.native.play).not.toHaveBeenCalled();

      player.resume();
      await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalled());
      expect(scenario.lastNativePlay).toMatchObject({
        entryId: 'B',
        startTimeMs: expectedElapsed * 1000,
      });
    }
  );

  it('preserves position and resumes there when neither duration is known', async () => {
    loser.sourceTrack.duration = undefined;

    await scenario.restore({
      checkpoint: { entryId: 'B', elapsedSeconds: 120, durationSeconds: null },
    });

    expect(player.progress).toEqual({ elapsed: 120, duration: 0, percent: 0 });
    expect(scenario.savedCheckpoint).toEqual({
      entryId: 'B',
      elapsedSeconds: 120,
      durationSeconds: null,
    });

    player.resume();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalled());
    expect(scenario.lastNativePlay).toMatchObject({ entryId: 'B', startTimeMs: 120000 });
  });

  it('retains the duplicate queue occurrence and shuffled order from Realm', async () => {
    await scenario.restore({
      queueEntries: [
        { id: 'A1', sourceTrackUuid: 'minglewood' },
        { id: 'A2', sourceTrackUuid: 'minglewood' },
        { id: 'B', sourceTrackUuid: 'loser' },
      ],
      shuffleOrder: { entryIds: ['B', 'A2', 'A1'] },
      checkpoint: { entryId: 'A2', elapsedSeconds: 222, durationSeconds: 381 },
    });
    expect(player.queue.currentIndex).toBe(1);
    expect(player.queue.orderedTracks.map((track) => track.sourceTrack.uuid)).toEqual([
      'loser',
      'minglewood',
      'minglewood',
    ]);
    expect(scenario.savedCheckpoint).toMatchObject({
      entryId: 'A2',
      elapsedSeconds: 222,
    });
  });

  it('keeps duplicate occurrences linked to original order after shuffled restore and advance', async () => {
    const third = track('third', 430);
    await scenario.restore(
      {
        queueEntries: [
          { id: 'A1', sourceTrackUuid: 'minglewood' },
          { id: 'B', sourceTrackUuid: 'loser' },
          { id: 'A2', sourceTrackUuid: 'minglewood' },
          { id: 'C', sourceTrackUuid: 'third' },
        ],
        shuffleOrder: { entryIds: ['A1', 'C', 'A2', 'B'] },
        checkpoint: { entryId: 'A1', elapsedSeconds: 222, durationSeconds: 381 },
      },
      [minglewood.sourceTrack, loser.sourceTrack, third.sourceTrack]
    );
    expect(player.queue.orderedTracks.map((track) => track.identifier)).toEqual([
      'A1',
      'C',
      'A2',
      'B',
    ]);
    scenario.emit({ identifier: 'A2' });
    player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_OFF);
    expect(player.queue.currentIndex).toBe(2);
    expect(player.queue.currentTrack?.identifier).toBe('A2');
    expect(player.queue.nextTrack?.identifier).toBe('C');
  });

  it('restores a queue without inventing a selection when its checkpoint is null', async () => {
    await scenario.restore({ checkpoint: null });
    expect(player.queue.orderedTracks.map((track) => track.identifier)).toEqual(['A', 'B']);
    expect(player.queue.currentTrack).toBeUndefined();
    expect(scenario.savedCheckpoint).toBeNull();
    expect(mocks.native.play).not.toHaveBeenCalled();
  });

  it('retains measured duration/position from identified Realm state', async () => {
    await scenario.restore({
      checkpoint: { entryId: 'B', elapsedSeconds: 420, durationSeconds: 430 },
    });
    expect(player.progress).toMatchObject({ elapsed: 420, duration: 430 });
  });

  it('does not apply a missing catalog entry timing to the remaining fallback track', async () => {
    const third = track('third', 430);
    await scenario.restore(
      {
        queueEntries: [
          { id: 'A', sourceTrackUuid: 'minglewood' },
          { id: 'B', sourceTrackUuid: 'loser' },
          { id: 'C', sourceTrackUuid: 'third' },
        ],
        shuffleOrder: { entryIds: ['C', 'A', 'B'] },
        checkpoint: { entryId: 'A', elapsedSeconds: 120, durationSeconds: 381 },
      },
      [loser.sourceTrack, third.sourceTrack]
    );
    expect(player.queue.currentTrack?.identifier).toBe('C');
    expect(player.progress).toMatchObject({ elapsed: 0, duration: 430 });
    expect(scenario.savedState.shuffleOrder?.entryIds).toEqual(['C', 'B']);
  });

  it('does not erase a saved queue when native pause arrives before startup restore', () => {
    state.setState(RelistenPlaybackState.Paused);
    player.queue.flushPlayerState();
    expect(mocks.save).not.toHaveBeenCalled();
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
      state.setState(playbackState);
      expect(player.canRestorePlayerState).toBe(allowed);
      player.playbackIntentStarted = true;
      expect(player.canRestorePlayerState).toBe(false);
    }
  );

  it('starts the restored stream and seek intent after an unsolicited startup pause', async () => {
    state.setState(RelistenPlaybackState.Paused);
    await scenario.restore();
    expect(player.state).toBe(RelistenPlaybackState.Stopped);
    player.resume();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalled());
    expect(scenario.lastNativePlay).toMatchObject({
      sourceTrackUuid: 'loser',
      startTimeMs: 120000,
    });
  });

  it('confirms a restored selection so native preparation and later Next requests can proceed', async () => {
    await scenario.restore({
      checkpoint: { entryId: 'A', elapsedSeconds: 120, durationSeconds: 381 },
    });
    expect(player.queue.nextTrack).toBeUndefined();

    player.resume();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));
    scenario.emit({ identifier: 'A', elapsed: 120, duration: 381 });
    const [preparedStream] = mocks.native.setNextStream.mock.lastCall!;
    expect(preparedStream?.identifier).toBe('B');

    player.next();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(2));
    expect(scenario.lastNativePlay).toMatchObject({ entryId: 'B', startTimeMs: undefined });
  });
});

describe('terminal playback', () => {
  beforeEach(() => scenario.startPlayingQueue());

  it('applies a terminal stop without replacing the selected entry or its timing', () => {
    const stopped = scenario.capture({
      identifier: undefined,
      sourceTrackUuid: undefined,
      elapsed: undefined,
      duration: undefined,
      playbackState: RelistenPlaybackState.Stopped,
    });
    scenario.deliver(stopped);
    expect(player.state).toBe(RelistenPlaybackState.Stopped);
    expect(player.queue.currentTrack).toBe(minglewood);
    expect(player.progress?.elapsed).toBe(120);
    expect(scenario.savedState).toMatchObject({
      checkpoint: { entryId: minglewood.identifier, elapsedSeconds: 120 },
    });
    scenario.deliver({
      ...stopped,
      sequence: stopped.sequence - 1,
      playbackState: RelistenPlaybackState.Playing,
    });
    expect(player.state).toBe(RelistenPlaybackState.Stopped);
  });

  it.each(['Next', 'Stop/Resume'] as const)(
    'restores the confirmed UI and remains stopped after failed preparation through %s',
    async (action) => {
      const selection = vi.fn();
      player.queue.onCurrentTrackChanged.addListener(selection);
      let requestedTrack = loser;
      if (action === 'Next') {
        player.next();
      } else {
        await player.stop();
        player.resume();
        requestedTrack = minglewood;
      }
      await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));
      expect(selection).toHaveBeenLastCalledWith(requestedTrack);

      scenario.emit({
        identifier: undefined,
        sourceTrackUuid: undefined,
        playbackState: RelistenPlaybackState.Stopped,
        checkpoint: true,
      });
      latestError.setState({
        identifier: requestedTrack.identifier,
        error: {
          kind: RelistenPlaybackErrorKind.NetworkUnavailable,
          message: 'Requested stream could not be prepared',
          isRetryable: true,
          platform: 'ios',
        },
      });

      expect(selection).toHaveBeenLastCalledWith(minglewood);
      expect(progress.lastState()?.elapsed).toBe(120);
      await vi.advanceTimersByTimeAsync(300);
      expect(player.state).toBe(RelistenPlaybackState.Stopped);
      player.togglePauseResume();
      await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(2));
      expect(scenario.lastNativePlay).toMatchObject({
        entryId: minglewood.identifier,
        startTimeMs: 120000,
      });
    }
  );

  it('prepares the successor again after stopping and resuming the same entry', async () => {
    await player.stop();
    mocks.native.setNextStream.mockClear();

    player.resume();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalledTimes(1));
    scenario.emit({ identifier: minglewood.identifier, elapsed: 120, duration: 381 });

    const [preparedStream] = mocks.native.setNextStream.mock.lastCall!;
    expect(preparedStream?.identifier).toBe(loser.identifier);
  });

  it('starts the selected stream after Android clears an already-paused controller', async () => {
    scenario.emit({ playbackState: RelistenPlaybackState.Paused });
    mocks.native.stop.mockImplementationOnce(async () => {
      // Android first captures the paused position, then reports the empty controller.
      scenario.emit({ playbackState: RelistenPlaybackState.Paused, checkpoint: true });
      scenario.emit({
        identifier: undefined,
        sourceTrackUuid: undefined,
        playbackState: RelistenPlaybackState.Stopped,
        checkpoint: true,
      });
    });
    await player.stop();
    expect(player.state).toBe(RelistenPlaybackState.Stopped);
    player.resume();
    await vi.waitFor(() => expect(mocks.native.play).toHaveBeenCalled());
    expect(scenario.lastNativePlay).toMatchObject({
      entryId: minglewood.identifier,
      startTimeMs: 120000,
    });
    expect(mocks.native.resume).not.toHaveBeenCalled();
  });
});
