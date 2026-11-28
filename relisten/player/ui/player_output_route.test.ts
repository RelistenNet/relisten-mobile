import { createElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { renderToStaticMarkup } = await vi.importActual<{
  renderToStaticMarkup(element: ReactElement): string;
}>('react-dom/server');

const state = vi.hoisted(() => ({
  platform: 'ios',
  cast: { isCasting: false, deviceName: undefined as string | undefined },
  sonosRoomName: undefined as string | undefined,
  sonosHandoff: undefined as { groupId: string; groupName: string } | undefined,
  getAudioOutputRoute: vi.fn(),
}));
vi.mock('@/modules/relisten-audio-player', () => ({
  nativePlayer: { getAudioOutputRoute: state.getAudioOutputRoute },
}));
vi.mock('@/relisten/casting/cast_ui', () => ({ useRelistenCastStatus: () => state.cast }));
vi.mock('@/relisten/sonos/sonos_room_store', () => ({
  useSonosRoomName: () => state.sonosRoomName,
  useSonosHandoffInFlight: () => state.sonosHandoff,
}));
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

import { PlayerOutputRoute, usePlayerOutput } from './player_output_route';

function outputKind() {
  function Probe() {
    return createElement('span', null, usePlayerOutput()?.kind ?? '');
  }
  const kind = renderToStaticMarkup(createElement(Probe)).replace(/<\/?span>/g, '');
  return kind || undefined;
}

function visibleRoute() {
  return renderToStaticMarkup(createElement(PlayerOutputRoute));
}

beforeEach(() => {
  state.platform = 'ios';
  state.cast = { isCasting: false, deviceName: undefined };
  state.sonosRoomName = undefined;
  state.sonosHandoff = undefined;
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

  it('names the Sonos room playing this queue ahead of the phone output', () => {
    state.getAudioOutputRoute.mockReturnValue({ name: 'Headphones', isExternal: true });
    state.sonosRoomName = 'Office';
    expect(visibleRoute()).toContain('Office');
    expect(visibleRoute()).not.toContain('Headphones');
  });

  it('names the room the queue is moving to, over the room it leaves', () => {
    state.sonosRoomName = 'Office';
    state.sonosHandoff = { groupId: 'g2', groupName: 'Kitchen' };
    expect(visibleRoute()).toContain('Connecting to Kitchen…');
    expect(visibleRoute()).not.toContain('Office');
  });

  it('keeps a connected Cast destination visible before its name arrives', () => {
    state.cast = { isCasting: true, deviceName: undefined };
    expect(visibleRoute()).toContain('Cast device');
  });

  it('reads the system route on Android too, with Cast still ahead of it', () => {
    state.platform = 'android';
    state.getAudioOutputRoute.mockReturnValue({ name: 'Pixel Buds', isExternal: true });
    expect(visibleRoute()).toContain('Pixel Buds');
    state.cast = { isCasting: true, deviceName: 'Kitchen speaker' };
    expect(visibleRoute()).toContain('Kitchen speaker');
  });

  it('has no system route on web', () => {
    state.platform = 'web';
    expect(visibleRoute()).toBe('');
    expect(state.getAudioOutputRoute).not.toHaveBeenCalled();
  });
});

describe('player output kind', () => {
  it('passes through the kind the native side reports', () => {
    state.getAudioOutputRoute.mockReturnValue({
      name: 'AirPods',
      isExternal: true,
      kind: 'bluetooth',
    });
    expect(outputKind()).toBe('bluetooth');
  });

  it('shows a route from an older binary, with no kind, as a generic output, not Sonos', () => {
    state.getAudioOutputRoute.mockReturnValue({ name: "Alex's AirPods", isExternal: true });
    expect(outputKind()).toBe('other');
  });

  it('marks a Sonos room and a Cast device by their own kind', () => {
    state.getAudioOutputRoute.mockReturnValue({
      name: 'AirPods',
      isExternal: true,
      kind: 'bluetooth',
    });
    state.cast = { isCasting: true, deviceName: 'Kitchen speaker' };
    expect(outputKind()).toBe('cast');
    state.sonosRoomName = 'Office';
    expect(outputKind()).toBe('sonos');
  });
});
