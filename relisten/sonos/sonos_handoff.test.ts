import { describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ info: vi.fn(), warn: vi.fn() }) },
}));

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

import { AccountsApiError } from '@/relisten/accounts/api/accounts_api_client';
import { handoffRequest, runSonosHandoff } from './sonos_handoff';

const UUID_A = '7f1d1d55-0000-4000-8000-000000000001';
const UUID_B = '7f1d1d55-0000-4000-8000-000000000002';

const request = {
  request_id: 'req-1',
  group_id: 'group-1',
  track_ids: ['track_a', 'track_b'],
  start_index: 1,
  position_millis: 12000,
};

function receipt(status: string, extra: Record<string, unknown> = {}) {
  return {
    request_id: 'req-1',
    status,
    playback_event_state: null,
    playback_handle: status === 'loaded' ? UUID_A : null,
    ...extra,
  };
}

function api(...results: unknown[]) {
  const client = { request: vi.fn() };
  for (const result of results) {
    if (result instanceof Error) {
      client.request.mockRejectedValueOnce(result);
    } else {
      client.request.mockResolvedValueOnce(result);
    }
  }
  return client;
}

const timing = { wait: vi.fn().mockResolvedValue(undefined), maxPolls: 3, maxRetries: 1 };

describe('handoffRequest', () => {
  it('starts at the playing occurrence when a recording is queued twice', () => {
    const tracks = [
      { identifier: 'q1', sourceTrack: { uuid: UUID_A } },
      { identifier: 'q2', sourceTrack: { uuid: UUID_B } },
      { identifier: 'q3', sourceTrack: { uuid: UUID_A } },
    ];

    const result = handoffRequest({
      requestId: 'req-1',
      groupId: 'group-1',
      tracks,
      currentIdentifier: 'q3',
      positionSeconds: 12.4,
    });

    expect(result?.start_index).toBe(2);
    expect(result?.track_ids).toHaveLength(3);
    expect(result?.track_ids[0]).toBe(result?.track_ids[2]);
    expect(result?.position_millis).toBe(12400);
  });

  it('has nothing to send when no occurrence is playing', () => {
    expect(
      handoffRequest({
        requestId: 'req-1',
        groupId: 'group-1',
        tracks: [{ identifier: 'q1', sourceTrack: { uuid: UUID_A } }],
        currentIdentifier: undefined,
        positionSeconds: 0,
      })
    ).toBeUndefined();
  });
});

describe('runSonosHandoff', () => {
  it('reports playing once the room loads the queue', async () => {
    const client = api(receipt('loaded', { playback_event_state: 'PLAYBACK_STATE_PLAYING' }));

    const outcome = await runSonosHandoff(client as never, request, timing);

    expect(outcome).toMatchObject({ kind: 'playing' });
    expect(client.request).toHaveBeenCalledWith(
      '/v1/integrations/sonos/handoffs',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(request) })
    );
  });

  it('polls a dispatching handoff until it settles', async () => {
    const client = api(receipt('dispatching'), receipt('dispatching'), receipt('loaded'));

    await expect(runSonosHandoff(client as never, request, timing)).resolves.toMatchObject({
      kind: 'playing',
    });
    expect(client.request).toHaveBeenLastCalledWith('/v1/integrations/sonos/handoffs/req-1');
  });

  it('leaves the outcome uncertain when the room never confirms', async () => {
    const client = api(
      receipt('dispatching'),
      receipt('dispatching'),
      receipt('dispatching'),
      receipt('dispatching')
    );

    await expect(runSonosHandoff(client as never, request, timing)).resolves.toEqual({
      kind: 'uncertain',
    });
  });

  it('lets the phone resume when Sonos refuses before taking over', async () => {
    const client = api(receipt('failed'));

    await expect(runSonosHandoff(client as never, request, timing)).resolves.toMatchObject({
      kind: 'refused',
      reconnect: false,
    });
  });

  it('asks to reconnect when the link needs renewing', async () => {
    const client = api(new AccountsApiError('', 409, 'sonos_reconnect_required', false));

    await expect(runSonosHandoff(client as never, request, timing)).resolves.toMatchObject({
      kind: 'refused',
      reconnect: true,
    });
  });

  it('retries a lost submission with the same body', async () => {
    const client = api(new AccountsApiError('Offline', null, null, true), receipt('loaded'));

    await expect(runSonosHandoff(client as never, request, timing)).resolves.toMatchObject({
      kind: 'playing',
    });
    const bodies = client.request.mock.calls.map(([, options]) => options?.body);
    expect(bodies).toEqual([JSON.stringify(request), JSON.stringify(request)]);
  });

  it('checks whether a lost submission arrived before giving up', async () => {
    const offline = new AccountsApiError('Offline', null, null, true);
    const client = api(offline, offline, receipt('loaded'));

    await expect(runSonosHandoff(client as never, request, timing)).resolves.toMatchObject({
      kind: 'playing',
    });
    expect(client.request).toHaveBeenLastCalledWith('/v1/integrations/sonos/handoffs/req-1');
  });

  it('keeps local playback paused when a lost submission is followed by a missing receipt', async () => {
    const offline = new AccountsApiError('Offline', null, null, true);
    const client = api(offline, offline, new AccountsApiError('Not found', 404, null, false));

    await expect(runSonosHandoff(client as never, request, timing)).resolves.toMatchObject({
      kind: 'uncertain',
    });
  });

  it.each(['evicted', 'interrupted', 'revoked', 'unknown'])(
    'keeps local playback paused after a %s handoff result',
    async (status) => {
      const client = api(receipt(status));
      await expect(runSonosHandoff(client as never, request, timing)).resolves.toEqual({
        kind: 'uncertain',
      });
    }
  );

  it.each([{ playback_handle: null }, { request_id: 'wrong-request' }])(
    'treats an inconsistent loaded receipt as uncertain',
    async (fields) => {
      const client = api(receipt('loaded', fields));
      await expect(runSonosHandoff(client as never, request, timing)).resolves.toEqual({
        kind: 'uncertain',
      });
    }
  );

  it('stops a handoff retry when the account changes', async () => {
    const client = api(new AccountsApiError('Offline', null, null, true), receipt('loaded'));
    let current = true;
    const outcome = await runSonosHandoff(client as never, request, {
      ...timing,
      wait: async () => {
        current = false;
      },
      isCurrent: () => current,
    });
    expect(outcome).toEqual({ kind: 'uncertain' });
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it('explains a queue Sonos cannot stream', async () => {
    const client = api(new AccountsApiError('Invalid', 422, null, false));

    await expect(runSonosHandoff(client as never, request, timing)).resolves.toMatchObject({
      kind: 'refused',
      message: 'Some tracks in your queue can’t play on Sonos.',
    });
  });
});
