import { type JSX } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Execute the actual provider and navigation hook with controllable native
// completion delivery. This checks their wiring, not Worklets memory safety.
const harness = vi.hoisted(() => ({
  cleanups: [] as (() => void)[],
  springs: [] as { target: number; config: unknown; finish?: (finished: boolean) => void }[],
  queuedCallbacks: [] as (() => void)[],
  bridgedCallbacks: [] as (() => void)[],
  state: vi.fn(),
  cancel: vi.fn(),
  push: vi.fn(),
  pushShow: vi.fn(),
  hapticImpact: vi.fn(),
  /** The route showing under the player. */
  segments: [] as string[],
  /** What the player's `TrackNavigationProvider` would supply. */
  leaveScreen: undefined as ((navigate: () => void) => void) | undefined,
  track: {
    sourceTrack: {
      artist: { uuid: 'artist-id', name: 'Phish' },
      show: {
        uuid: 'show-id',
        displayDate: '1998-07-19',
        artistUuid: 'artist-id',
        venue: { name: 'Alpine Valley' },
        venueUuid: 'venue-id',
      },
      artistUuid: 'artist-id',
      showUuid: 'show-id',
      sourceUuid: 'source-id',
      normalization: {
        parts: [{ ordinal: 1, song: { id: 'song_simple', name: 'Simple' } }],
      },
    },
  },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
    // Nothing renders here, so no provider runs: the player's track navigation
    // comes from the harness, and every other context reads as its default.
    useContext: (context: { _currentValue: unknown; displayName?: string }) =>
      context.displayName === 'TrackNavigation' ? harness.leaveScreen : context._currentValue,
    useMemo: (factory: () => unknown) => factory(),
    useRef: (current: unknown) => ({ current }),
    useState: (initial: unknown) => [initial, harness.state],
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (cleanup) harness.cleanups.push(cleanup);
    },
  };
});
vi.mock('react-native-reanimated', () => ({
  cancelAnimation: harness.cancel,
  makeMutable: (initial: unknown) => ({
    value: initial,
    set(value: unknown) {
      this.value = value;
    },
  }),
  withSpring: (target: number, config: unknown, finish?: (finished: boolean) => void) => {
    harness.springs.push({ target, config, finish });
    return target;
  },
  runOnJS: (callback: () => void) => {
    harness.bridgedCallbacks.push(callback);
    return () => harness.queuedCallbacks.push(callback);
  },
}));
vi.mock('react-native', () => ({ InteractionManager: { runAfterInteractions: vi.fn() } }));
vi.mock('expo-haptics', () => ({
  impactAsync: harness.hapticImpact,
  ImpactFeedbackStyle: { Light: 'light' },
}));
vi.mock('expo-router', () => ({
  router: { push: harness.push },
  useNavigation: vi.fn(),
  useSegments: () => harness.segments,
}));
vi.mock('@/relisten/components/menus/native_menu_icons', () => ({ nativeMenuIcons: {} }));
vi.mock('@/relisten/components/menus/native_menu_view', () => ({ NativeMenuView: vi.fn() }));
vi.mock('@/relisten/player/audio_adjustments/audio_adjustment_native', () => ({
  audioAdjustmentNative: { capabilities: () => ({ supported: true }) },
}));
vi.mock('@/relisten/player/relisten_player_queue_hooks', () => ({
  useRelistenPlayerCurrentTrack: () => harness.track,
}));
vi.mock('@/relisten/player/relisten_player_hooks', () => ({ useRelistenPlayer: () => ({}) }));
vi.mock('@/relisten/playlists/playlist_hooks', () => ({ trackIdForSourceTrack: vi.fn() }));
vi.mock('@/relisten/util/push_show', () => ({
  usePushShowRespectingUserSettings: () => ({ pushShow: harness.pushShow }),
}));
vi.mock('@/relisten/util/routes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/relisten/util/routes')>()),
  useGroupSegment: () => '(artists)',
}));

import { PlayerActionsMenu } from './player_actions_menu';
import { useCurrentTrackNavigation } from './current_track_navigation_menu';
import { PlayerPresentationProvider, playerPresentationContentReady } from './player_presentation';

function mountPlayer() {
  const element = PlayerPresentationProvider({ children: null });
  const presentation = element.props.value;
  harness.leaveScreen = presentation.closePlayer;
  const menu = useCurrentTrackNavigation();
  presentation.openPlayer();
  presentation.markPlayerContentReady();
  return { presentation, menu };
}

function finishLatestClose() {
  const close = harness.springs.findLast((spring) => spring.target === 0);
  expect(close?.finish).toBeTypeOf('function');
  close!.finish!(true);
}

function deliverCallbacks() {
  harness.queuedCallbacks.splice(0).forEach((callback) => callback());
}

beforeEach(() => {
  vi.clearAllMocks();
  playerPresentationContentReady.set(false);
  harness.cleanups.length = 0;
  harness.springs.length = 0;
  harness.queuedCallbacks.length = 0;
  harness.bridgedCallbacks.length = 0;
  harness.leaveScreen = undefined;
  harness.segments = [];
});

describe('player presentation and menu navigation contract', () => {
  it('gives one haptic for each committed endpoint, including gesture-driven changes', () => {
    const presentation = PlayerPresentationProvider({ children: null }).props.value;
    presentation.beginInteractivePresentation();
    expect(harness.hapticImpact).not.toHaveBeenCalled();
    presentation.openPlayer();
    presentation.markPlayerContentReady();
    presentation.openPlayer();
    expect(harness.hapticImpact).toHaveBeenCalledTimes(1);

    presentation.beginInteractivePresentation();
    presentation.closePlayer();
    presentation.closePlayer();
    expect(harness.hapticImpact).toHaveBeenCalledTimes(2);
  });

  it('keeps cancelled drags, lifecycle resets, and unmount cleanup silent', () => {
    const presentation = PlayerPresentationProvider({ children: null }).props.value;
    presentation.beginInteractivePresentation();
    presentation.closePlayer();
    expect(harness.hapticImpact).not.toHaveBeenCalled();

    presentation.openPlayer();
    presentation.beginInteractivePresentation();
    presentation.openPlayer();
    expect(harness.hapticImpact).toHaveBeenCalledTimes(1);

    presentation.resetPlayerPresentation();
    expect(harness.hapticImpact).toHaveBeenCalledTimes(1);
    presentation.openPlayer();
    expect(harness.hapticImpact).toHaveBeenCalledTimes(2);
    harness.cleanups.forEach((cleanup) => cleanup());
    expect(harness.hapticImpact).toHaveBeenCalledTimes(2);
  });

  it('waits for committed timeline content on every fresh open', () => {
    const presentation = PlayerPresentationProvider({ children: null }).props.value;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      harness.springs.length = 0;
      presentation.openPlayer();
      expect(harness.springs).toHaveLength(0);
      expect(playerPresentationContentReady.value).toBe(false);
      presentation.markPlayerContentReady();
      expect(harness.springs.map(({ target }) => target)).toEqual([1]);
      expect(playerPresentationContentReady.value).toBe(true);
      presentation.closePlayer();
      finishLatestClose();
      deliverCallbacks();
    }
  });

  it('does not reopen when content becomes ready after an early close or reset', () => {
    const presentation = PlayerPresentationProvider({ children: null }).props.value;
    presentation.openPlayer();
    presentation.closePlayer();
    presentation.markPlayerContentReady();
    expect(harness.springs.map(({ target }) => target)).toEqual([0]);
    expect(playerPresentationContentReady.value).toBe(false);
    presentation.openPlayer();
    presentation.resetPlayerPresentation();
    presentation.markPlayerContentReady();
    expect(harness.springs.map(({ target }) => target)).toEqual([0]);
  });

  it('reveals an active drag without starting an automatic open spring', () => {
    const presentation = PlayerPresentationProvider({ children: null }).props.value;
    presentation.beginInteractivePresentation();
    presentation.markPlayerContentReady();
    expect(playerPresentationContentReady.value).toBe(true);
    expect(harness.springs).toHaveLength(0);
    presentation.openPlayer();
    expect(harness.springs.map(({ target }) => target)).toEqual([1]);
  });

  it('keeps the original modal spring for opening, closing, and returning from a dismiss drag', () => {
    const { presentation } = mountPlayer();
    presentation.closePlayer();
    presentation.beginInteractivePresentation();
    presentation.openPlayer();
    presentation.beginInteractivePresentation();
    presentation.closePlayer();

    expect(harness.springs.map(({ target }) => target)).toEqual([1, 0, 1, 0]);
    for (const { config } of harness.springs) {
      expect(config).toEqual({
        damping: 30,
        mass: 0.82,
        overshootClamping: true,
        stiffness: 300,
      });
    }
  });

  it.each(['artist', 'show'] as const)(
    'defers the %s destination until closing completes',
    (action) => {
      const { menu } = mountPlayer();
      menu.handleAction(action);
      expect(harness.push).not.toHaveBeenCalled();
      expect(harness.pushShow).not.toHaveBeenCalled();
      finishLatestClose();
      expect(harness.push).not.toHaveBeenCalled();
      expect(harness.pushShow).not.toHaveBeenCalled();
      deliverCallbacks();
      expect(harness.state).toHaveBeenLastCalledWith('idle');
      if (action === 'artist') {
        expect(harness.push).toHaveBeenCalledWith({
          pathname: '/relisten/tabs/(artists)/[artistUuid]/',
          params: { artistUuid: 'artist-id' },
        });
        expect(harness.pushShow).not.toHaveBeenCalled();
      } else {
        expect(harness.pushShow).toHaveBeenCalledWith({
          artist: harness.track.sourceTrack.artist,
          showUuid: 'show-id',
          sourceUuid: 'source-id',
          overrideGroupSegment: '(artists)',
        });
        expect(harness.push).not.toHaveBeenCalled();
      }
    }
  );

  it('goes to the venue after closing', () => {
    const { menu } = mountPlayer();
    expect(menu.actions.map((action) => action.title)).toContain('Go to Alpine Valley');

    menu.handleAction('venue');
    finishLatestClose();
    expect(harness.push).not.toHaveBeenCalled();
    deliverCallbacks();
    expect(harness.push).toHaveBeenCalledWith({
      pathname: '/relisten/tabs/(artists)/[artistUuid]/venue/[venueUuid]/',
      params: { artistUuid: 'artist-id', venueUuid: 'venue-id', venueKind: 'imported_venue' },
    });
  });

  it('opens the venue in the tab showing under the player', () => {
    harness.segments = ['relisten', 'tabs', '(myLibrary)', 'playlists', '[playlistId]'];
    const { menu } = mountPlayer();

    menu.handleAction('venue');
    finishLatestClose();
    deliverCallbacks();
    expect(harness.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/relisten/tabs/(myLibrary)/[artistUuid]/venue/[venueUuid]/',
      })
    );
  });

  it.each(['artist', 'show'] as const)(
    'dispatches the grouped More menu %s action after closing',
    (actionId) => {
      mountPlayer();
      const element = PlayerActionsMenu({ children: null }) as JSX.Element;
      const action = element.props.actions
        .flatMap((section: { subactions: { id: string }[] }) => section.subactions)
        .find(({ id }: { id: string }) => id === actionId);
      element.props.onPressAction({ nativeEvent: { event: action.id } });
      expect(harness.push).not.toHaveBeenCalled();
      expect(harness.pushShow).not.toHaveBeenCalled();
      finishLatestClose();
      deliverCallbacks();
      expect(actionId === 'artist' ? harness.push : harness.pushShow).toHaveBeenCalledOnce();
    }
  );

  it('opens the equalizer from the grouped More menu without dismissing the player', () => {
    mountPlayer();
    const element = PlayerActionsMenu({ children: null }) as JSX.Element;
    const action = element.props.actions
      .flatMap((section: { subactions: { id: string }[] }) => section.subactions)
      .find(({ id }: { id: string }) => id === 'audio-adjustments');
    const springCount = harness.springs.length;
    element.props.onPressAction({ nativeEvent: { event: action.id } });
    expect(harness.push).toHaveBeenCalledWith('/relisten/audio-adjustments');
    expect(harness.springs).toHaveLength(springCount);
  });

  it.each(['openPlayer', 'beginInteractivePresentation', 'resetPlayerPresentation'] as const)(
    '%s invalidates a close callback already queued for JS delivery',
    (interrupt) => {
      const { presentation, menu } = mountPlayer();
      menu.handleAction('show');
      finishLatestClose();
      presentation[interrupt]();
      const stateCalls = harness.state.mock.calls.length;
      deliverCallbacks();
      expect(harness.state).toHaveBeenCalledTimes(stateCalls);
      expect(harness.pushShow).not.toHaveBeenCalled();
    }
  );

  it('unmount cleanup cancels the native animation and queued navigation', () => {
    const { menu } = mountPlayer();
    menu.handleAction('artist');
    finishLatestClose();
    harness.cancel.mockClear();
    harness.cleanups.forEach((cleanup) => cleanup());
    const stateCalls = harness.state.mock.calls.length;
    deliverCallbacks();
    expect(harness.cancel).toHaveBeenCalledOnce();
    expect(harness.state).toHaveBeenCalledTimes(stateCalls);
    expect(harness.push).not.toHaveBeenCalled();
  });

  it('does not bridge a canceled native spring completion', () => {
    const { menu } = mountPlayer();
    menu.handleAction('artist');
    harness.springs.at(-1)!.finish!(false);
    expect(harness.bridgedCallbacks).toHaveLength(0);
    expect(harness.push).not.toHaveBeenCalled();
  });

  it('bridges fresh callbacks on repeated closes and ignores duplicate delivery', () => {
    const { presentation, menu } = mountPlayer();
    menu.handleAction('artist');
    finishLatestClose();
    deliverCallbacks();
    presentation.openPlayer();
    presentation.markPlayerContentReady();
    menu.handleAction('show');
    finishLatestClose();
    expect(harness.bridgedCallbacks[1]).not.toBe(harness.bridgedCallbacks[0]);
    harness.bridgedCallbacks[0]();
    deliverCallbacks();
    harness.bridgedCallbacks[1]();
    expect(harness.push).toHaveBeenCalledOnce();
    expect(harness.pushShow).toHaveBeenCalledOnce();
  });
});
