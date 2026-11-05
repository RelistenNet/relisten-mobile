import { createElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { renderToStaticMarkup } = await vi.importActual<{
  renderToStaticMarkup(element: ReactElement): string;
}>('react-dom/server');

const state = vi.hoisted(() => ({
  platform: 'ios',
  cast: { isCasting: false, deviceName: undefined as string | undefined },
  getAudioOutputRoute: vi.fn(),
}));
vi.mock('@/modules/relisten-audio-player', () => ({
  nativePlayer: { getAudioOutputRoute: state.getAudioOutputRoute },
}));
vi.mock('@/relisten/casting/cast_ui', () => ({ useRelistenCastStatus: () => state.cast }));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return state.platform;
    },
  },
}));
vi.mock('@/relisten/components/relisten_text', () => ({
  RelistenText: ({ children }: { children: string }) => createElement('span', null, children),
}));

import { PlayerOutputRoute } from './player_output_route';

function visibleRoute() {
  return renderToStaticMarkup(createElement(PlayerOutputRoute));
}

beforeEach(() => {
  state.platform = 'ios';
  state.cast = { isCasting: false, deviceName: undefined };
  state.getAudioOutputRoute.mockReset().mockReturnValue({ name: '', isExternal: false });
});

describe('player output feedback', () => {
  it('keeps built-in playback quiet', () => {
    expect(visibleRoute()).toBe('');
  });

  it.each(['Living Room', "Alex's AirPods", 'USB DAC'])(
    'shows the actual external name: %s',
    (name) => {
      state.getAudioOutputRoute.mockReturnValue({ name, isExternal: true });
      expect(visibleRoute()).toContain(name.replaceAll("'", '&#x27;'));
    }
  );

  it('gives the connected Cast device priority over the phone output', () => {
    state.getAudioOutputRoute.mockReturnValue({ name: 'Headphones', isExternal: true });
    state.cast = { isCasting: true, deviceName: 'Kitchen speaker' };
    expect(visibleRoute()).toContain('Kitchen speaker');
    expect(visibleRoute()).not.toContain('Headphones');
  });

  it('keeps a connected Cast destination visible before its name arrives', () => {
    state.cast = { isCasting: true, deviceName: undefined };
    expect(visibleRoute()).toContain('Cast device');
  });

  it('does not call iOS methods on Android and retains Cast feedback', () => {
    state.platform = 'android';
    expect(visibleRoute()).toBe('');
    state.cast = { isCasting: true, deviceName: 'Kitchen speaker' };
    expect(visibleRoute()).toContain('Kitchen speaker');
    expect(state.getAudioOutputRoute).not.toHaveBeenCalled();
  });
});
