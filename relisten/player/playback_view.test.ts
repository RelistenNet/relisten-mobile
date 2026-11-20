import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

vi.mock('@/modules/relisten-audio-player', () => ({ RelistenPlaybackState: {} }));
vi.mock('@/relisten/player/native_playback_state_hooks', () => ({}));
vi.mock('@/relisten/player/relisten_player_hooks', () => ({}));
vi.mock('@/relisten/player/relisten_player_queue_hooks', () => ({}));
vi.mock('@/relisten/sonos/sonos_remote', () => ({}));

import { sonosQueueTrack } from './playback_view';
import { formatUuidTypedId } from '@/relisten/util/typed_uuid_id';

const UUID_A = '7f1d1d55-0000-4000-8000-000000000001';
const UUID_B = '7f1d1d55-0000-4000-8000-000000000002';

const tracks = [
  { identifier: 'q1', sourceTrack: { uuid: UUID_A } },
  { identifier: 'q2', sourceTrack: { uuid: UUID_B } },
  { identifier: 'q3', sourceTrack: { uuid: UUID_A } },
] as never[];

function occurrence(queueIndex: number, uuid: string) {
  return {
    itemId: `item-${queueIndex}`,
    queueIndex,
    trackId: formatUuidTypedId('track', uuid),
    name: 'Loser',
    durationMillis: null,
    artist: null,
    album: null,
    imageUrl: null,
  };
}

describe('sonosQueueTrack', () => {
  it('finds the occurrence the room plays, even when the recording repeats', () => {
    expect(sonosQueueTrack(tracks, occurrence(2, UUID_A))).toBe(tracks[2]);
  });

  it('gives up when the phone queue no longer matches the room', () => {
    expect(sonosQueueTrack(tracks, occurrence(1, UUID_A))).toBeUndefined();
    expect(sonosQueueTrack(tracks, occurrence(9, UUID_A))).toBeUndefined();
    expect(sonosQueueTrack(tracks, null)).toBeUndefined();
  });
});
