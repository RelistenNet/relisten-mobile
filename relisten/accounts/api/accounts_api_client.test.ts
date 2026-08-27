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
  scopeId: 'user:test-user',
  userUuid: 'test-user',
  generation: 1,
  nativeSessionId: 'test-session',
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
      headers: { 'X-Test': 'present' },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://accounts.relisten.net/v1/logout');
    expect(init.credentials).toBe('omit');
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer access-token');
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('X-Test')).toBe('present');
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
