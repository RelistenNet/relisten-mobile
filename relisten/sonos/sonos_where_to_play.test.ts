import { describe, expect, it, vi } from 'vitest';

const alert = vi.hoisted(() => vi.fn());
vi.mock('react-native', () => ({ Alert: { alert }, Platform: { OS: 'ios' } }));

import { askWhereToPlay, playDestination, STALE_ROOM_MS } from './sonos_where_to_play';

const NOW = Date.parse('2026-11-25T12:00:00Z');
const pausedRoom = {
  roomPlaying: false,
  lastInUseAt: NOW - STALE_ROOM_MS - 1,
  lastReadFailed: false,
  appActive: true,
  now: NOW,
};

describe('playDestination', () => {
  it('asks about a room paused longer than the stale limit', () => {
    expect(playDestination(pausedRoom)).toBe('ask');
  });

  it('plays on a playing room', () => {
    expect(playDestination({ ...pausedRoom, roomPlaying: true })).toBe('room');
  });

  it('plays on a room in use within the stale limit', () => {
    expect(playDestination({ ...pausedRoom, lastInUseAt: NOW - STALE_ROOM_MS + 1 })).toBe('room');
  });

  it('plays on the phone when the room’s latest read got no answer, even while it played', () => {
    expect(playDestination({ ...pausedRoom, roomPlaying: true, lastReadFailed: true })).toBe(
      'phone'
    );
  });

  it('keeps the room when the app is in the background, where nothing can ask', () => {
    expect(playDestination({ ...pausedRoom, appActive: false })).toBe('room');
  });
});

describe('askWhereToPlay', () => {
  it('plays on the phone when the question is dismissed', async () => {
    const answer = askWhereToPlay('Office');
    const [, , , options] = alert.mock.lastCall!;

    options.onDismiss();

    await expect(answer).resolves.toBe('phone');
  });

  it('plays on the room the listener taps', async () => {
    const answer = askWhereToPlay('Office');
    const [, , buttons] = alert.mock.lastCall!;

    buttons.find((button: { text: string }) => button.text === 'Office').onPress();

    await expect(answer).resolves.toBe('room');
  });
});
