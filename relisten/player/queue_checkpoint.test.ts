import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const harness = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('@/modules/relisten-audio-player', () => ({ nativePlayer: { setNextStream: vi.fn() } }));
vi.mock('@/relisten/player/native_playback_state_hooks', () => ({ addPlayerListeners: vi.fn() }));
vi.mock('@/relisten/realm/schema', () => ({ realm: {} }));
vi.mock('@/relisten/realm/models/player_state', () => ({ PlayerState: { upsert: harness.save } }));
vi.mock('@/relisten/realm/models/source_track', () => ({ SourceTrack: class {} }));
vi.mock('@/relisten/util/logging', () => ({
  log: { debug: vi.fn(), extend: () => ({ debug: vi.fn(), warn: vi.fn() }) },
}));
import { RelistenPlayerQueue, PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import type { RelistenPlayer } from './relisten_player';
import type { SourceTrack } from '@/relisten/realm/models/source_track';

describe('queue checkpoint write boundaries', () => {
  let queue: RelistenPlayerQueue;
  let progress: { elapsed: number; duration: number; percent: number };
  beforeEach(() => {
    vi.useFakeTimers();
    harness.save.mockClear();
    progress = { elapsed: 120, duration: 381, percent: 120 / 381 };
    const player = {
      get progress() {
        return progress;
      },
      checkpointProgress: () => progress,
      setNextStream: vi.fn(),
      cancelPendingPlayRequests: vi.fn(),
    };
    queue = new RelistenPlayerQueue(player as unknown as RelistenPlayer);
    const track = new PlayerQueueTrack(
      {
        uuid: 'A',
        duration: 381,
        streamingUrl: () => 'unused',
        downloadedFileLocation: () => 'unused',
      } as unknown as SourceTrack,
      'A',
      '',
      '',
      '',
      ''
    );
    queue.replaceQueue([track], undefined);
    queue.onCurrentTrackIdentifierChanged(track.identifier);
    vi.advanceTimersByTime(5000);
    harness.save.mockClear();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  it('writes final progress synchronously, before the runtime can disappear', () => {
    progress = { ...progress, elapsed: 123, percent: 123 / 381 };
    queue.savePlayerState(true);
    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ elapsed: 123 })
    );
  });
  it('does not postpone normal persistence under a stream of updates', () => {
    for (let sample = 1; sample <= 10; sample++) {
      const elapsed = 120 + sample / 2;
      progress = { ...progress, elapsed, percent: elapsed / 381 };
      queue.savePlayerState();
      vi.advanceTimersByTime(500);
    }
    expect(harness.save).toHaveBeenCalledTimes(1);
    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ elapsed: 125 })
    );
  });
  it('cancels the pending timer after a final write', () => {
    progress = { ...progress, elapsed: 122, percent: 122 / 381 };
    queue.savePlayerState();
    progress = { ...progress, elapsed: 123, percent: 123 / 381 };
    queue.savePlayerState(true);
    const count = harness.save.mock.calls.length;
    vi.advanceTimersByTime(10000);
    expect(harness.save).toHaveBeenCalledTimes(count);
    expect(harness.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ elapsed: 123 })
    );
  });
});
