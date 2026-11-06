import { createElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { renderToStaticMarkup } = await vi.importActual<{
  renderToStaticMarkup(element: ReactElement): string;
}>('react-dom/server');
const state = vi.hoisted(() => ({
  platform: 'ios',
  playerHeight: 0,
  bottomInset: 83,
  playerPlacement: 'nativeTabsAccessory',
  navigate: vi.fn(),
  onAction: undefined as (() => void) | undefined,
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ navigate: state.navigate }) }));
vi.mock('react-native', () => ({
  View: 'div',
  Platform: {
    get OS() {
      return state.platform;
    },
  },
}));
vi.mock('@/relisten/player/ui/player_bar_layout', () => ({
  usePlayerBarPlacementBackend: () => state.playerPlacement,
  usePlayerBarVisualHeight: () => state.playerHeight,
}));
vi.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 106 }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: state.bottomInset }),
}));
vi.mock('@/relisten/components/non_ideal_state', () => ({
  NonIdealState: ({ onAction }: { onAction: () => void }) => {
    state.onAction = onAction;
    return null;
  },
}));

import { OfflineArtistsEmptyState } from './offline_artists_empty_state';

describe('empty Offline tab', () => {
  it('switches to the Artists tab instead of opening a catalog inside Offline', () => {
    renderToStaticMarkup(createElement(OfflineArtistsEmptyState));
    state.onAction!();
    expect(state.navigate).toHaveBeenCalledWith('/relisten/tabs/(artists)');
  });

  it.each([
    ['ios', 'nativeTabsAccessory', 0, 83, 83],
    ['ios', 'nativeTabsAccessory', 64, 147, 147],
    ['ios', 'overlay', 64, 83, 147],
    ['android', 'overlay', 0, 0, 0],
    ['android', 'overlay', 64, 0, 64],
  ] as const)(
    'reserves visible bars on %s with %s and player height %i',
    (platform, playerPlacement, playerHeight, bottomInset, bottom) => {
      state.platform = platform;
      state.playerPlacement = playerPlacement;
      state.playerHeight = playerHeight;
      state.bottomInset = bottomInset;
      const html = renderToStaticMarkup(createElement(OfflineArtistsEmptyState));
      expect(html).toContain(`padding-bottom:${bottom}${bottom ? 'px' : ''}`);
      expect(html).toContain(`padding-top:${platform === 'ios' ? '106px' : '0'}`);
    }
  );
});
