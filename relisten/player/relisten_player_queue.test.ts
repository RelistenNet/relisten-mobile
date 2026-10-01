import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/relisten-audio-player', () => ({
  nativePlayer: { setShuffleMode: vi.fn() },
}));
vi.mock('@/relisten/player/native_playback_state_hooks', () => ({}));
vi.mock('@/relisten/player/shared_state', () => ({}));
vi.mock('@/relisten/realm/schema', () => ({ realm: undefined }));
vi.mock('@/relisten/realm/models/source_track', () => ({ SourceTrack: class {} }));
vi.mock('@/relisten/realm/models/player_state', () => ({}));
vi.mock('@/relisten/util/logging', () => ({
  log: { debug: vi.fn(), extend: () => ({ warn: vi.fn() }) },
}));

import type { RelistenPlayer } from './relisten_player';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { PlayerQueueTrack, PlayerShuffleState, RelistenPlayerQueue } from './relisten_player_queue';

afterEach(() => vi.restoreAllMocks());

function createQueue(shuffleState: PlayerShuffleState) {
  const player = { cancelPendingPlayRequests: vi.fn() } as unknown as RelistenPlayer;
  const queue = new RelistenPlayerQueue(player);
  const save = vi.spyOn(queue, 'savePlayerState').mockImplementation(() => {});
  const tracks = ['A', 'B', 'C'].map(
    (uuid) => new PlayerQueueTrack({ uuid } as SourceTrack, uuid, '', '', '', '')
  );
  queue.replaceQueue(tracks, undefined);
  queue.setShuffleState(shuffleState);
  save.mockClear();
  const changed = vi.fn();
  queue.onOrderedTracksChanged.addListener(changed);
  return { queue, save, changed };
}

describe.each([PlayerShuffleState.SHUFFLE_OFF, PlayerShuffleState.SHUFFLE_ON])(
  'queue moves with shuffle state %s',
  (shuffleState) => {
    it.each([
      [-1, 1],
      [0, -1],
      [3, 0],
      [0, 3],
      [0.5, 1],
      [0, 0.5],
      [NaN, 1],
      [0, Infinity],
      [1, 1],
    ])('ignores invalid or unchanged indexes %s -> %s', (from, to) => {
      const { queue, save, changed } = createQueue(shuffleState);
      const before = queue.orderedTracks;

      queue.moveQueueTrack(from, to);

      expect(queue.orderedTracks).toBe(before);
      expect(save).not.toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
    });

    it('moves a track in both directions without changing queue membership', () => {
      const { queue, save, changed } = createQueue(shuffleState);
      const [a, b, c] = queue.orderedTracks;

      queue.moveQueueTrack(0, 2);
      expect(queue.orderedTracks).toEqual([b, c, a]);
      queue.moveQueueTrack(2, 0);
      expect(queue.orderedTracks).toEqual([a, b, c]);
      expect(changed).toHaveBeenCalledTimes(2);
      expect(save).toHaveBeenCalledTimes(2);
    });

    it('rejects a drag index made stale by replacing the queue', () => {
      const { queue, save, changed } = createQueue(shuffleState);
      queue.replaceQueue([], undefined);
      save.mockClear();
      changed.mockClear();

      queue.moveQueueTrack(2, 0);

      expect(queue.orderedTracks).toEqual([]);
      expect(save).not.toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
    });
  }
);
