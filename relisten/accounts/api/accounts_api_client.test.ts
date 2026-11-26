import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/util/logging', () => ({
  log: {
    extend: () => ({ info: vi.fn(), warn: vi.fn() }),
  },
}));

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

import {
  AccountsApiError,
  AccountsApiTransport,
  AuthorizedAccountsApiClient,
} from './accounts_api_client';
import { AccountScopeCapture, StaleAccountScopeError } from '../account_scope_store';

const capture: AccountScopeCapture = Object.freeze({
  scopeId: 'user_01hx3x56tafay8vvr14d2pf2db',
  userId: 'user_01hx3x56tafay8vvr14d2pf2db',
  generation: 1,
  nativeSessionId: 'session_01hx3x56tbfay8vvr14d2pf2db',
  isAuthenticated: true,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AccountsApiTransport', () => {
  it('keeps native bearer requests free of browser credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const transport = new AccountsApiTransport('https://accounts.relisten.net');

    await transport.request('/v1/logout', 'access-token', {
      method: 'POST',
      credentials: 'include',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('omit');
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer access-token');
  });

  /** A fetch that never answers, ending only when its signal aborts, as a dead connection does. */
  function hangingFetch() {
    return vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        )
    );
  }

  it('fails a request that outlasts its time limit as a lost response', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());
    const transport = new AccountsApiTransport('https://accounts.relisten.net');

    const request = transport.request('/v1/integrations/sonos/groups', 'token', {
      timeoutMs: 8000,
    });
    const failure = expect(request).rejects.toMatchObject({ status: null, retryable: true });
    await vi.advanceTimersByTimeAsync(8000);

    await failure;
    vi.useRealTimers();
  });

  it('fails as a lost response when the body stalls past the time limit', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => ({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
          ),
      }))
    );
    const transport = new AccountsApiTransport('https://accounts.relisten.net');

    const request = transport.request('/v1/integrations/sonos/groups', 'token', {
      timeoutMs: 8000,
    });
    const failure = expect(request).rejects.toMatchObject({ status: null, retryable: true });
    await vi.advanceTimersByTimeAsync(8000);

    await failure;
    vi.useRealTimers();
  });

  it('still stops when the caller cancels a request that has a time limit', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const transport = new AccountsApiTransport('https://accounts.relisten.net');
    const controller = new AbortController();

    const request = transport.request('/v1/search', 'token', {
      signal: controller.signal,
      timeoutMs: 8000,
    });
    controller.abort();

    await expect(request).rejects.toBeInstanceOf(AccountsApiError);
  });
});

describe('AuthorizedAccountsApiClient', () => {
  it('refreshes and retries exactly once after an unauthorized response', async () => {
    const transport = {
      request: vi
        .fn()
        .mockRejectedValueOnce(new AccountsApiError('Unauthorized', 401, null, false))
        .mockResolvedValueOnce({ revision: 1 }),
    };
    const scopeSource = {
      capture: vi.fn(() => capture),
      isCurrent: vi.fn(() => true),
    };
    const tokenSource = {
      getAccessToken: vi
        .fn()
        .mockResolvedValueOnce('stale-access-token')
        .mockResolvedValueOnce('fresh-access-token'),
    };
    const client = new AuthorizedAccountsApiClient(
      transport as never,
      scopeSource as never,
      tokenSource
    );

    await expect(client.request('/v1/library/snapshot')).resolves.toEqual({ revision: 1 });

    expect(tokenSource.getAccessToken.mock.calls).toEqual([[capture], [capture, true]]);
    expect(transport.request.mock.calls).toEqual([
      ['/v1/library/snapshot', 'stale-access-token', {}],
      ['/v1/library/snapshot', 'fresh-access-token', {}],
    ]);
  });

  it('rejects a response that finishes after the account scope changes', async () => {
    const transport = { request: vi.fn().mockResolvedValue({ revision: 1 }) };
    const scopeSource = {
      capture: vi.fn(() => capture),
      isCurrent: vi.fn(() => false),
    };
    const tokenSource = { getAccessToken: vi.fn().mockResolvedValue('access-token') };
    const client = new AuthorizedAccountsApiClient(
      transport as never,
      scopeSource as never,
      tokenSource
    );

    await expect(client.request('/v1/library/snapshot')).rejects.toBeInstanceOf(
      StaleAccountScopeError
    );
  });
});
