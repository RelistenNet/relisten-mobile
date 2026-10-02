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
  track: {
    sourceTrack: {
      artist: { uuid: 'artist-id', name: 'Phish' },
      show: { uuid: 'show-id', displayDate: '1998-07-19' },
      source: { uuid: 'source-id' },
    },
  },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
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
vi.mock('expo-router', () => ({ router: { push: harness.push }, useNavigation: vi.fn() }));
vi.mock('@/relisten/components/menus/native_menu_icons', () => ({ nativeMenuIcons: {} }));
vi.mock('@/relisten/components/menus/native_menu_view', () => ({ NativeMenuView: vi.fn() }));
vi.mock('@/relisten/player/relisten_player_queue_hooks', () => ({
  useRelistenPlayerCurrentTrack: () => harness.track,
}));
vi.mock('@/relisten/util/push_show', () => ({
  usePushShowRespectingUserSettings: () => ({ pushShow: harness.pushShow }),
}));
vi.mock('@/relisten/util/routes', () => ({ useGroupSegment: () => '(artists)' }));

import { useCurrentTrackNavigation } from './current_track_navigation_menu';
import { PlayerPresentationProvider, playerPresentationContentReady } from './player_presentation';

function mountPlayer() {
  const element = PlayerPresentationProvider({ children: null });
  const presentation = element.props.value;
  const menu = useCurrentTrackNavigation(presentation.closePlayer);
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
});

describe('player presentation and menu navigation contract', () => {
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
