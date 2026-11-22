import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerStateProps } from '@/relisten/realm/models/player_state';
import type { PlaybackContextProgress } from './shared_state';

const mocks = vi.hoisted(() => ({
  save: vi.fn<(realm: unknown, state: PlayerStateProps) => void>(),
}));
vi.mock('@/modules/relisten-audio-player', () => ({ nativePlayer: { setNextStream: vi.fn() } }));
vi.mock('@/relisten/player/native_playback_state_hooks', () => ({ addPlayerListeners: vi.fn() }));
vi.mock('@/relisten/realm/schema', () => ({ realm: {} }));
vi.mock('@/relisten/realm/models/player_state', () => ({ PlayerState: { upsert: mocks.save } }));
vi.mock('@/relisten/realm/models/source_track', () => ({ SourceTrack: class {} }));
vi.mock('@/relisten/util/logging', () => ({
  log: { debug: vi.fn(), extend: () => ({ debug: vi.fn(), warn: vi.fn() }) },
}));

import { RelistenPlayerQueue, PlayerQueueTrack, remoteSelection } from './relisten_player_queue';
import type { RelistenPlayer } from './relisten_player';
import type { SourceTrack } from '@/relisten/realm/models/source_track';

describe('queue checkpoint write boundaries', () => {
  let queue: RelistenPlayerQueue;
  let confirmedProgress: PlaybackContextProgress;

  function observeElapsed(elapsed: number) {
    confirmedProgress = { elapsed, duration: 381, percent: elapsed / 381 };
  }

  function savedCheckpoint() {
    return mocks.save.mock.lastCall![1].checkpoint;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.save.mockClear();
    observeElapsed(120);
    const player = {
      checkpointProgress: () => confirmedProgress,
      setNextStream: vi.fn(),
      cancelPendingPlayRequests: vi.fn(),
    };
    queue = new RelistenPlayerQueue(player as unknown as RelistenPlayer);
    const sourceTrack = {
      uuid: 'minglewood',
      duration: 381,
      streamingUrl: () => 'unused',
      downloadedFileLocation: () => 'unused',
    } as unknown as SourceTrack;
    const track = new PlayerQueueTrack(sourceTrack, 'Minglewood', '', '', '', '');
    queue.replaceQueue([track], undefined);
    queue.onCurrentTrackIdentifierChanged(track.identifier);
    vi.advanceTimersByTime(5000);
    mocks.save.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('writes final progress synchronously, before the runtime can disappear', () => {
    observeElapsed(123);

    queue.flushPlayerState();

    expect(savedCheckpoint()?.elapsedSeconds).toBe(123);
  });

  it('does not postpone normal persistence under a stream of updates', () => {
    for (let elapsed = 120.5; elapsed <= 125; elapsed += 0.5) {
      observeElapsed(elapsed);
      queue.savePlayerState();
      vi.advanceTimersByTime(500);
    }

    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(savedCheckpoint()?.elapsedSeconds).toBe(125);
  });

  it('cancels the pending timer after a final write', () => {
    observeElapsed(122);
    queue.savePlayerState();
    observeElapsed(123);

    queue.flushPlayerState();
    vi.advanceTimersByTime(10000);

    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(savedCheckpoint()?.elapsedSeconds).toBe(123);
  });
});

describe('adopting a remote queue', () => {
  function track(name: string) {
    const sourceTrack = {
      uuid: name,
      duration: 300,
      streamingUrl: () => 'unused',
      downloadedFileLocation: () => 'unused',
    } as unknown as SourceTrack;
    return new PlayerQueueTrack(sourceTrack, name, '', '', '', '');
  }

  function queueWith(tracks: PlayerQueueTrack[], current: PlayerQueueTrack) {
    const player = {
      checkpointProgress: () => undefined,
      setNextStream: vi.fn(),
      cancelPendingPlayRequests: vi.fn(),
    };
    const queue = new RelistenPlayerQueue(player as unknown as RelistenPlayer);
    queue.replaceQueue(tracks, undefined);
    queue.onCurrentTrackIdentifierChanged(current.identifier);
    return queue;
  }

  it('selects the room’s playing track', () => {
    const [scarlet, fire] = [track('Scarlet'), track('Fire')];
    const queue = queueWith([scarlet, fire], scarlet);

    queue.adoptRemoteQueue([scarlet, fire], fire.identifier);

    expect(queue.currentTrack).toBe(fire);
  });

  it('keeps the phone’s selection, and says so, when the reading lacks the room’s track', () => {
    const [scarlet, fire] = [track('Scarlet'), track('Fire')];
    const queue = queueWith([scarlet, fire], fire);
    const announced = vi.fn();
    queue.onCurrentTrackChanged.addListener(announced);

    queue.adoptRemoteQueue([scarlet, fire], 'not-in-this-reading');

    expect(queue.currentTrack).toBe(fire);
    expect(announced).toHaveBeenLastCalledWith(fire);
  });

  it('never leaves queued tracks with nothing selected', () => {
    const queue = queueWith([track('Scarlet')], track('Scarlet'));
    const [estimated, saint] = [track('Estimated'), track('Saint Stephen')];

    queue.adoptRemoteQueue([estimated, saint], undefined);

    expect(queue.currentTrack).toBe(estimated);
  });

  it('announces no track for an empty remote queue', () => {
    const scarlet = track('Scarlet');
    const queue = queueWith([scarlet], scarlet);
    const announced = vi.fn();
    queue.onCurrentTrackChanged.addListener(announced);

    queue.adoptRemoteQueue([], undefined);

    expect(queue.currentTrack).toBeUndefined();
    expect(announced).toHaveBeenLastCalledWith(undefined);
  });

  it('prefers the room, then the phone', () => {
    const [a, b] = [track('a'), track('b')];
    expect(remoteSelection([a, b], b.identifier, a.identifier)).toBe(b.identifier);
    expect(remoteSelection([a, b], 'gone', b.identifier)).toBe(b.identifier);
    expect(remoteSelection([a, b], 'gone', 'also-gone')).toBeUndefined();
    expect(remoteSelection([], 'gone', undefined)).toBeUndefined();
  });
});
