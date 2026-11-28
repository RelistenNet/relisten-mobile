import { describe, expect, it, vi } from 'vitest';
import type Realm from 'realm';
import type { RelistenApiClient } from '@/relisten/api/client';
import type { RelistenPlayer } from '@/relisten/player/relisten_player';
import { EventSource } from '@/relisten/util/event_source';

type Listener = (value: unknown) => void;
function sharedState() {
  const listeners = new Set<Listener>();
  return {
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    emit: (value: unknown) => listeners.forEach((listener) => listener(value)),
  };
}
const states = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof sharedState>>);
const resolver = vi.hoisted(() => ({ resolve: undefined as undefined | (() => void) }));

vi.mock('@/modules/relisten-audio-player', () => ({
  RelistenPlaybackState: { Playing: 'Playing' },
}));
vi.mock('@/relisten/player/shared_state', () => {
  states.latestError = sharedState();
  states.state = sharedState();
  return { latestError: states.latestError, state: states.state };
});
vi.mock('@/relisten/playlists/playlist_hooks', () => ({ trackIdForSourceTrack: () => 'track_a' }));
vi.mock('@/relisten/playlists/playlist_hydration', () => ({
  resolvePlaylistTracks: () =>
    new Promise((resolve) => {
      resolver.resolve = () => resolve(new Map([['track_a', 'unavailable']]));
    }),
}));
vi.mock('@/relisten/api/context', () => ({}));
vi.mock('@/relisten/player/relisten_player_hooks', () => ({}));
vi.mock('@/relisten/realm/schema', () => ({}));

const { createFailureHandler } = await import('./playlist_playback_recovery');

function fakePlayer() {
  const failed = {
    identifier: 'occurrence-a',
    playlistContext: { playlistId: 'p', entryId: 'e', segmentInstanceId: 's' },
    sourceTrack: { isValid: () => true, offlineInfo: undefined },
  };
  return {
    playCommandVersion: 1,
    next: vi.fn(),
    queue: {
      orderedTracks: [failed],
      currentTrack: failed,
      onOrderedTracksChanged: new EventSource<unknown>(),
    },
  };
}

async function failThenResolve(player: ReturnType<typeof fakePlayer>, between: () => void) {
  const stop = createFailureHandler(
    {} as Realm,
    {} as RelistenApiClient,
    player as unknown as RelistenPlayer
  );
  states.latestError.emit({ identifier: 'occurrence-a' });
  between();
  resolver.resolve!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  stop();
}

describe('playlist playback recovery', () => {
  it('skips a gone recording when nothing else happened meanwhile', async () => {
    const player = fakePlayer();
    await failThenResolve(player, () => {});
    expect(player.next).toHaveBeenCalledOnce();
  });

  it('leaves a later play, skip, or stop alone when the catalog answers late', async () => {
    const player = fakePlayer();
    // The listener picked another track (or stopped) while the catalog was asked.
    await failThenResolve(player, () => {
      player.playCommandVersion += 1;
    });
    expect(player.next).not.toHaveBeenCalled();
  });
});
