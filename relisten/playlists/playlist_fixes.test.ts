import { describe, expect, it, vi } from 'vitest';
import type { RelistenPlayer } from '@/relisten/player/relisten_player';
import type { PlaylistRowGroup } from '@/relisten/playlists/playlist_hooks';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));
vi.mock('@/relisten/events', () => ({
  playlistActionEvent: vi.fn(),
  sharedStatsigClient: () => ({ logEvent: vi.fn() }),
}));
vi.mock('@/modules/relisten-audio-player', () => ({
  RelistenPlaybackState: { Playing: 'Playing' },
}));
vi.mock('@/relisten/player/relisten_player_queue', () => ({
  PlayerQueueTrack: { fromSourceTrack: (sourceTrack: unknown) => ({ sourceTrack }) },
  PlayerShuffleState: { SHUFFLE_ON: 1 },
}));

const { playPlaylist } = await import('./playlist_playback');
const { normalizePlaylistName } = await import('./playlist_repository');

function row(entryId: string, downloaded: boolean) {
  return {
    entry: { entryId, segmentId: 'segment', trackId: `track_${entryId}`, rank: entryId },
    sourceTrack: { offlineInfo: { isPlayableOffline: () => downloaded } },
    status: 'playable' as const,
  };
}

describe('playing a playlist offline', () => {
  const groups = [
    { segment: { segmentId: 'a', rank: 'a' }, entries: [row('downloaded', true)] },
    { segment: { segmentId: 'b', rank: 'b' }, entries: [row('streaming', false)] },
  ] as unknown as PlaylistRowGroup[];

  it('leaves the queue alone when the tapped track is not downloaded', () => {
    const replaceQueue = vi.fn();
    const player = { queue: { replaceQueue } } as unknown as RelistenPlayer;

    expect(playPlaylist(player, 'playlist', groups, false, 'streaming')).toBe(false);
    expect(replaceQueue).not.toHaveBeenCalled();

    expect(playPlaylist(player, 'playlist', groups, false, 'downloaded')).toBe(true);
    expect(replaceQueue).toHaveBeenCalledWith(expect.any(Array), 0, { resetShuffle: true });
  });
});

describe('playlist text', () => {
  it('counts characters the way the server does and drops NUL', () => {
    const name = `${'a'.repeat(99)}😀b`;
    expect(normalizePlaylistName(name)).toBe(`${'a'.repeat(99)}😀`);
    expect(normalizePlaylistName('Road\0 Trip')).toBe('Road Trip');
  });
});
