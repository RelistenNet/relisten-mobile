import { describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ info: vi.fn(), warn: vi.fn() }) },
}));

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
  randomUUID: () => 'test-command-id',
}));

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
    current_occurrence: {
      item_id: 'item-1',
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

function store() {
  const api = { request: vi.fn() };
  const remote = new SonosRemoteStore({
    wait: () => Promise.resolve(),
    confirmIntervalMs: 0,
    confirmAttempts: 3,
  });
  remote.bind(api as never);
  return { api, remote };
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

    expect(remote.getState()).toEqual({ kind: 'none' });
  });

  it('clears remote controls when the handle is gone', async () => {
    const { api, remote } = store();
    api.request
      .mockResolvedValueOnce(playback('h1'))
      .mockRejectedValueOnce(new AccountsApiError('', 404, null, false));

    remote.adopt('h1', 'Office');
    await flush();
    await remote.refresh();

    expect(remote.getState()).toEqual({ kind: 'none' });
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
    await remote.command('play');
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
    await remote.command('play');

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
    await remote.command('play');

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
    await remote.command('play');

    const state = remote.getState();
    expect(state.kind === 'active' && state.commandError).toBe('Sonos didn’t confirm. Try again.');
  });

  it('restores active playback found on launch without sending commands', async () => {
    const { api, remote } = store();
    api.request.mockResolvedValueOnce([playback('h9')]);

    await remote.discover();

    const state = remote.getState();
    expect(state.kind === 'active' && state.playback.handle).toBe('h9');
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request).toHaveBeenCalledWith('/v1/integrations/sonos/playback');
  });

  it('ends remote control on sign-out', async () => {
    const { api, remote } = store();
    api.request.mockResolvedValueOnce(playback('h1'));
    remote.adopt('h1', 'Office');
    await flush();

    remote.bind(undefined);

    expect(remote.getState()).toEqual({ kind: 'none' });
  });
});
