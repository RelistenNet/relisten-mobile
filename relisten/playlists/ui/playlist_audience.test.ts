import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasPublicPlaylistAudience } from '../playlist_audience';
import { useLibraryPlaylistAudience, usePublicPlaylistAudience } from './playlist_audience';

const harness = vi.hoisted(() => ({
  mountEffects: [] as { run: () => unknown; dependencies: readonly unknown[] }[],
  focusEffects: [] as (() => unknown)[],
  api: { request: vi.fn().mockResolvedValue({ playlists: [] }) },
  sharing: { publicSnapshot: vi.fn().mockResolvedValue(null) },
  state: undefined as unknown,
}));

vi.mock('react', () => ({
  useCallback: (callback: () => unknown) => callback,
  useEffect: (run: () => unknown, dependencies: readonly unknown[]) =>
    harness.mountEffects.push({ run, dependencies }),
  useState: () => [
    harness.state,
    (value: unknown) => {
      harness.state = value;
    },
  ],
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (effect: () => unknown) => harness.focusEffects.push(effect),
}));
vi.mock('@/relisten/components/relisten_text', () => ({ RelistenText: 'Text' }));
vi.mock('@/relisten/accounts/account_context', () => ({
  useAccountScope: () => ({ generation: 1, isAuthenticated: true }),
  useAccountsApiClient: () => harness.api,
}));
vi.mock('@/relisten/realm/root_services', () => ({
  usePlaylistSharingService: () => harness.sharing,
}));
vi.mock('@/relisten/util/netinfo', () => ({ useShouldMakeNetworkRequests: () => true }));

describe('playlist audience', () => {
  beforeEach(() => {
    harness.state = undefined;
    harness.mountEffects.length = 0;
    harness.focusEffects.length = 0;
  });
  it('shows a followed playlist until its public copy becomes unavailable', () => {
    // The list's Realm row has published=false even when its server head is public.
    const followed = {
      access: 'follower',
      published: false,
      unavailable: false,
      takenDown: false,
      archived: false,
    } as const;
    expect(hasPublicPlaylistAudience(followed)).toBe(true);
    expect(hasPublicPlaylistAudience({ ...followed, unavailable: true })).toBe(false);
    expect(hasPublicPlaylistAudience({ ...followed, access: 'owner' })).toBe(false);
    expect(
      hasPublicPlaylistAudience({ ...followed, access: 'owner', published: true, archived: true })
    ).toBe(false);
    expect(
      hasPublicPlaylistAudience({ ...followed, access: 'owner', published: true, takenDown: true })
    ).toBe(false);
  });

  it.each([
    ['library', () => useLibraryPlaylistAudience(['first']), harness.api.request],
    ['public detail', () => usePublicPlaylistAudience('code'), harness.sharing.publicSnapshot],
  ] as const)(
    'loads %s metrics once while the screen stays mounted',
    (_name, useAudience, request) => {
      harness.mountEffects.length = 0;
      harness.focusEffects.length = 0;
      request.mockClear();
      useAudience();

      for (const effect of harness.mountEffects) {
        effect.run();
      }
      for (let focus = 0; focus < 2; focus++) {
        for (const effect of harness.focusEffects) {
          const blur = effect();
          if (typeof blur === 'function') {
            blur();
          }
        }
      }

      expect(request).toHaveBeenCalledTimes(1);
    }
  );

  it('loads metrics for a newly followed playlist even if the library stays mounted', () => {
    harness.mountEffects.length = 0;
    harness.api.request.mockClear();
    useLibraryPlaylistAudience(['first']);
    const first = harness.mountEffects.at(-1)!;
    const cleanup = first.run();

    useLibraryPlaylistAudience(['first', 'new-follow']);
    const next = harness.mountEffects.at(-1)!;
    if (
      next.dependencies.some(
        (dependency, index) => !Object.is(dependency, first.dependencies[index])
      )
    ) {
      if (typeof cleanup === 'function') {
        cleanup();
      }
      next.run();
    }

    expect(harness.api.request).toHaveBeenCalledTimes(2);
  });

  it('clears public metrics after a successful read reports the playlist is unavailable', async () => {
    harness.state = { code: 'code', audience: { follower_count: 4 } };
    expect(usePublicPlaylistAudience('code')).toEqual({ follower_count: 4 });
    harness.mountEffects.at(-1)!.run();
    await Promise.resolve();
    expect(usePublicPlaylistAudience('code')).toBeUndefined();
  });
});
