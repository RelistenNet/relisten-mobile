import { describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ info: vi.fn(), warn: vi.fn() }) },
}));

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
  randomUUID: () => 'test-command-id',
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

import { AccountsApiError } from '@/relisten/accounts/api/accounts_api_client';
import { SonosRemoteStore } from './sonos_remote';

function playback(handle: string, extra: Record<string, unknown> = {}) {
  return {
    playback_handle: handle,
    group_id: 'g1',
    group_name: 'Alec’s Office',
    status: 'active',
    playback_state: 'PLAYBACK_STATE_PAUSED',
    position_millis: 1000,
    observed_at: '2026-11-20T06:00:00Z',
    queue_version: 1,
    current_occurrence: {
      item_id: 'item-1',
      occurrence_id: 'q1',
      queue_index: 0,
      track_id: 'track_x',
      name: 'Loser',
      duration_millis: 400000,
      artist: 'Grateful Dead',
      album: null,
      image_url: null,
    },
    ...extra,
  };
}

function store(rememberedRoom?: string) {
  const api = { request: vi.fn() };
  const rooms = {
    load: vi.fn(async () => rememberedRoom),
    save: vi.fn(async () => {}),
  };
  const remote = new SonosRemoteStore(
    {
      wait: () => Promise.resolve(),
      confirmIntervalMs: 0,
      confirmAttempts: 3,
    },
    rooms
  );
  remote.bind(api as never, undefined, 'user-1');
  return { api, remote, rooms };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('SonosRemoteStore', () => {
  it('shows the room once an adopted handle is read', async () => {
    const { api, remote } = store();
    api.request.mockResolvedValueOnce(playback('h1'));

    remote.adopt('h1', 'Alec’s Office');
    expect(remote.getState().kind).toBe('checking');
    await flush();

    const state = remote.getState();
    expect(state.kind).toBe('active');
    expect(state.kind === 'active' && state.playback.occurrence?.name).toBe('Loser');
  });

  it('drops a late response for a handle that was replaced', async () => {
    const { api, remote } = store();
    let answerFirst: (value: unknown) => void = () => {};
    api.request
      .mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)))
      .mockResolvedValueOnce(playback('h2'));

    remote.adopt('h1', 'Office');
    remote.adopt('h2', 'Office');
    await flush();
    answerFirst(playback('h1'));
    await flush();

    const state = remote.getState();
    expect(state.kind === 'active' && state.playback.handle).toBe('h2');
  });

  it('clears remote controls when the room moves on', async () => {
    const { api, remote } = store();
    api.request
      .mockResolvedValueOnce(playback('h1'))
      .mockResolvedValueOnce(playback('h1', { status: 'evicted', current_occurrence: null }));

    remote.adopt('h1', 'Office');
    await flush();
    await remote.refresh();

    expect(remote.getState()).toEqual({ kind: 'none', endedRoom: 'Alec’s Office' });
  });

  it('clears remote controls when the handle is gone', async () => {
    const { api, remote } = store();
    api.request
      .mockResolvedValueOnce(playback('h1'))
      .mockRejectedValueOnce(new AccountsApiError('', 404, null, false));

    remote.adopt('h1', 'Office');
    await flush();
    await remote.refresh();

    expect(remote.getState()).toEqual({ kind: 'none', endedRoom: 'Alec’s Office' });
  });

  it('disables controls while the room is unconfirmed', async () => {
    const { api, remote } = store();
    api.request
      .mockResolvedValueOnce(playback('h1'))
      .mockResolvedValueOnce(playback('h1', { status: 'unconfirmed', current_occurrence: null }));

    remote.adopt('h1', 'Office');
    await flush();
    await remote.refresh();

    const state = remote.getState();
    expect(state.kind).toBe('checking');
    await remote.command({ action: 'play' });
    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it('plays, then reads until the room is playing', async () => {
    const { api, remote } = store();
    api.request
      .mockResolvedValueOnce(playback('h1'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(playback('h1'))
      .mockResolvedValueOnce(playback('h1', { playback_state: 'PLAYBACK_STATE_PLAYING' }));

    remote.adopt('h1', 'Office');
    await flush();
    await remote.command({ action: 'play' });

    expect(api.request).toHaveBeenNthCalledWith(
      2,
      '/v1/integrations/sonos/playback/h1/commands',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          action: 'play',
          command_id: 'test-command-id',
          expected_item_id: 'item-1',
        }),
      })
    );
    const state = remote.getState();
    expect(state.kind === 'active' && state.pending).toBeUndefined();
    expect(state.kind === 'active' && state.commandError).toBeUndefined();
  });

  it('reuses the command identity after a lost response and checks the room', async () => {
    const { api, remote } = store();
    api.request
      .mockResolvedValueOnce(playback('h1'))
      .mockRejectedValueOnce(new AccountsApiError('Offline', null, null, true))
      .mockResolvedValueOnce({ status: 'accepted' })
      .mockResolvedValueOnce(playback('h1', { playback_state: 'PLAYBACK_STATE_PLAYING' }));

    remote.adopt('h1', 'Office');
    await flush();
    await remote.command({ action: 'play' });

    expect(api.request.mock.calls[1]).toEqual(api.request.mock.calls[2]);
    const state = remote.getState();
    expect(state.kind === 'active' && state.commandError).toBeUndefined();
  });

  it('offers a retry when the room never shows the request', async () => {
    const { api, remote } = store();
    api.request
      .mockResolvedValueOnce(playback('h1'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(playback('h1'));

    remote.adopt('h1', 'Office');
    await flush();
    await remote.command({ action: 'play' });

    const state = remote.getState();
    expect(state.kind === 'active' && state.commandError).toBe('Sonos didn’t confirm. Try again.');
  });

  it('restores the room this device chose on launch, without sending commands', async () => {
    const { api, remote } = store('h9');
    api.request.mockResolvedValueOnce(playback('h9'));

    await remote.discover(() => true);

    const state = remote.getState();
    expect(state.kind === 'active' && state.playback.handle).toBe('h9');
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request).toHaveBeenCalledWith('/v1/integrations/sonos/playback/h9');
  });

  it('leaves the remembered room alone while something else plays', async () => {
    const { api, remote } = store('h9');

    await remote.discover(() => false);

    expect(remote.getState()).toEqual({ kind: 'none' });
    expect(api.request).not.toHaveBeenCalled();
  });

  it('takes over no room on launch when this device chose none', async () => {
    const { api, remote } = store(undefined);

    await remote.discover(() => true);

    expect(remote.getState()).toEqual({ kind: 'none' });
    expect(api.request).not.toHaveBeenCalled();
  });

  it('remembers an adopted room and forgets one that ended', async () => {
    const { api, remote, rooms } = store();
    api.request
      .mockResolvedValueOnce(playback('h1'))
      .mockResolvedValueOnce(playback('h1', { status: 'evicted', current_occurrence: null }));

    remote.adopt('h1', 'Office');
    await flush();
    await remote.refresh();

    expect(rooms.save).toHaveBeenNthCalledWith(1, 'user-1', 'h1');
    expect(rooms.save).toHaveBeenLastCalledWith('user-1', undefined);
    expect(remote.getState()).toEqual({ kind: 'none', endedRoom: 'Alec’s Office' });
  });

  it('ends remote control on sign-out', async () => {
    const { api, remote } = store();
    api.request.mockResolvedValueOnce(playback('h1'));
    remote.adopt('h1', 'Office');
    await flush();

    remote.bind(undefined);

    expect(remote.getState()).toEqual({ kind: 'none' });
  });

  it('jumps to an occurrence and confirms once the room is on it', async () => {
    const { api, remote } = store();
    const moved = playback('h1', {
      current_occurrence: {
        ...playback('h1').current_occurrence,
        item_id: 'item-2',
        occurrence_id: 'q2',
        queue_index: 1,
      },
    });
    api.request
      .mockResolvedValueOnce(playback('h1'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(moved);

    remote.adopt('h1', 'Office');
    await flush();
    const confirmed = await remote.command({ action: 'skip', occurrenceId: 'q2' });

    const body = JSON.parse(api.request.mock.calls[1][1].body);
    expect(body).toMatchObject({
      action: 'skip',
      expected_item_id: 'item-1',
      expected_queue_version: 1,
      target_occurrence_id: 'q2',
    });
    expect(confirmed).toBe(true);
    const state = remote.getState();
    expect(state.kind === 'active' && state.playback.occurrence?.itemId).toBe('item-2');
    expect(state.kind === 'active' && state.commandError).toBeUndefined();
  });

  it('seeks to an absolute position on the current occurrence', async () => {
    const { api, remote } = store();
    api.request
      .mockResolvedValueOnce(playback('h1'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(playback('h1', { position_millis: 42500 }));

    remote.adopt('h1', 'Office');
    await flush();
    await remote.command({ action: 'seek', positionMillis: 42000 });

    const body = JSON.parse(api.request.mock.calls[1][1].body);
    expect(body).toMatchObject({
      action: 'seek',
      expected_item_id: 'item-1',
      position_millis: 42000,
    });
    const state = remote.getState();
    expect(state.kind === 'active' && state.commandError).toBeUndefined();
  });

  it('explains a command Sonos refuses', async () => {
    const { api, remote } = store();
    api.request
      .mockResolvedValueOnce(playback('h1'))
      .mockRejectedValueOnce(new AccountsApiError('', 409, 'sonos_command_unavailable', false))
      .mockResolvedValueOnce(playback('h1'));

    remote.adopt('h1', 'Office');
    await flush();
    await remote.command({ action: 'seek', positionMillis: 999999 });

    const state = remote.getState();
    expect(state.kind === 'active' && state.commandError).toBe(
      'That isn’t available for this track.'
    );
  });

  it('names the version a queue edit saved when it next jumps', async () => {
    const { api, remote } = store();
    const moved = playback('h1', {
      queue_version: 2,
      current_occurrence: {
        ...playback('h1').current_occurrence,
        item_id: 'item-2',
        occurrence_id: 'q2',
      },
    });
    api.request
      .mockResolvedValueOnce(playback('h1'))
      .mockResolvedValueOnce({ queue_version: 2 })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(moved);

    remote.adopt('h1', 'Office');
    await flush();
    const saved = await remote.saveQueue(
      [
        { occurrenceId: 'q1', trackId: 'track_x' },
        { occurrenceId: 'q2', trackId: 'track_y' },
      ],
      1
    );
    await remote.command({ action: 'skip', occurrenceId: 'q2' });

    expect(saved).toEqual({ kind: 'saved', version: 2 });
    expect(JSON.parse(api.request.mock.calls[2][1].body)).toMatchObject({
      action: 'skip',
      expected_queue_version: 2,
    });
  });

  it('tells a queue edit the room moved on from one it refused', async () => {
    const { api, remote } = store();
    api.request
      .mockResolvedValueOnce(playback('h1'))
      .mockRejectedValueOnce(new AccountsApiError('', 409, 'sonos_playback_changed', false))
      .mockRejectedValueOnce(new AccountsApiError('', 409, 'sonos_queue_current_protected', false));

    remote.adopt('h1', 'Office');
    await flush();
    const entries = [{ occurrenceId: 'q1', trackId: 'track_x' }];

    expect(await remote.saveQueue(entries, 1)).toEqual({ kind: 'trackMoved' });
    expect(await remote.saveQueue(entries, 1)).toEqual({
      kind: 'refused',
      message: 'Sonos keeps the tracks through the one playing.',
    });
  });

  it('sets the group volume and reads it back', async () => {
    const { api, remote } = store();
    api.request
      .mockResolvedValueOnce(playback('h1'))
      .mockResolvedValueOnce({ volume: 30, muted: false, fixed: false })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ volume: 45, muted: false, fixed: false });

    remote.adopt('h1', 'Office');
    await flush();
    await remote.refreshVolume();
    await remote.setVolume({ volume: 45.4 });

    const body = JSON.parse(api.request.mock.calls[2][1].body);
    expect(body).toMatchObject({ action: 'volume', volume: 45 });
    const state = remote.getState();
    expect(state.kind === 'active' && state.volume?.volume).toBe(45);
  });

  it('shows a group’s last volume when a new handle plays on it', async () => {
    const { api, remote } = store();
    api.request
      .mockResolvedValueOnce(playback('h1'))
      .mockResolvedValueOnce({ volume: 30, muted: true, fixed: false })
      .mockResolvedValueOnce(playback('h2'));

    remote.adopt('h1', 'Office');
    await flush();
    await remote.refreshVolume();
    remote.adopt('h2', 'Office');
    await flush();

    const state = remote.getState();
    expect(state.kind === 'active' && state.playback.handle).toBe('h2');
    expect(state.kind === 'active' && state.volume).toEqual({
      volume: 30,
      muted: true,
      fixed: false,
    });
  });
});
