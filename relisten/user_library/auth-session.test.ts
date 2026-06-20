import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RelistenUserLibraryApiClient,
  UserLibraryApiError,
} from '@/relisten/api/user_library_client';
import {
  DevelopmentSessionRequest,
  UserLibraryAuthSessionError,
  UserLibraryAuthSessionService,
  UserLibraryAuthSessionServiceOptions,
  UserLibraryAuthTokenResponse,
  UserLibraryRefreshTokenStore,
} from '@/relisten/user_library/auth_session';

class MemoryRefreshTokenStore implements UserLibraryRefreshTokenStore {
  refreshToken: string | null = null;
  failWritesWith: Error | undefined;

  async getRefreshToken() {
    return this.refreshToken;
  }

  async setRefreshToken(refreshToken: string) {
    if (this.failWritesWith) {
      throw this.failWritesWith;
    }

    this.refreshToken = refreshToken;
  }

  async clearRefreshToken() {
    this.refreshToken = null;
  }
}

function authResponse(
  accessToken: string,
  refreshToken: string,
  overrides: Partial<UserLibraryAuthTokenResponse> = {}
): UserLibraryAuthTokenResponse {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    access_token_expires_at: '2026-06-20T05:00:00.000Z',
    refresh_token_expires_at: '2027-06-20T05:00:00.000Z',
    user: {
      user_uuid: 'user-1',
      username: 'ios_simulator',
      display_name: 'iOS Simulator',
      scope_id: 'user:user-1',
    },
    session: {
      session_uuid: 'session-1',
      device_id: 'device-1',
      device_name: 'iPhone Simulator',
      platform: 'ios',
      created_at: '2026-06-20T04:00:00.000Z',
      last_used_at: '2026-06-20T04:00:00.000Z',
    },
    ...overrides,
  };
}

function developmentSessionRequest(): DevelopmentSessionRequest {
  return {
    username: 'ios_simulator',
    display_name: 'iOS Simulator',
    device_id: 'device-1',
    device_name: 'iPhone Simulator',
    platform: 'ios',
  };
}

function serviceWithPostJson(
  postJson: ReturnType<typeof vi.fn>,
  store: UserLibraryRefreshTokenStore = new MemoryRefreshTokenStore(),
  options: UserLibraryAuthSessionServiceOptions = { developmentAuthEnabled: true }
) {
  const client = {
    postJson,
  } as unknown as RelistenUserLibraryApiClient;

  return {
    service: new UserLibraryAuthSessionService(client, store, options),
    store,
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('UserLibraryAuthSessionService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores refresh tokens from the Development session endpoint', async () => {
    const postJson = vi.fn(async () => authResponse('access-1', 'refresh-1'));
    const { service, store } = serviceWithPostJson(postJson);
    const request = developmentSessionRequest();

    const response = await service.signInDevelopmentSession(request);

    expect(postJson).toHaveBeenCalledWith('/auth/development/session', request);
    expect(response.access_token).toBe('access-1');
    await expect(store.getRefreshToken()).resolves.toBe('refresh-1');
    await expect(service.getAccessToken()).resolves.toBe('access-1');
  });

  it('rejects Development session sign-in when dev auth is disabled', async () => {
    const postJson = vi.fn(async () => authResponse('access-1', 'refresh-1'));
    const { service } = serviceWithPostJson(postJson, undefined, { developmentAuthEnabled: false });

    await expect(service.signInDevelopmentSession(developmentSessionRequest())).rejects.toEqual(
      new UserLibraryAuthSessionError('development_auth_disabled')
    );
    expect(postJson).not.toHaveBeenCalled();
  });

  it('defaults Development session sign-in to the build-time dev gate', async () => {
    vi.stubGlobal('__DEV__', false);
    const postJson = vi.fn(async () => authResponse('access-1', 'refresh-1'));
    const { service } = serviceWithPostJson(postJson, new MemoryRefreshTokenStore(), {});

    await expect(service.signInDevelopmentSession(developmentSessionRequest())).rejects.toEqual(
      new UserLibraryAuthSessionError('development_auth_disabled')
    );
    expect(postJson).not.toHaveBeenCalled();
  });

  it('rotates the stored refresh token when refreshing', async () => {
    const store = new MemoryRefreshTokenStore();
    await store.setRefreshToken('refresh-1');
    const postJson = vi.fn(async () => authResponse('access-2', 'refresh-2'));
    const { service } = serviceWithPostJson(postJson, store);

    await expect(service.refreshSession()).resolves.toEqual(
      expect.objectContaining({ access_token: 'access-2', refresh_token: 'refresh-2' })
    );

    expect(postJson).toHaveBeenCalledWith('/auth/refresh', { refresh_token: 'refresh-1' });
    await expect(store.getRefreshToken()).resolves.toBe('refresh-2');
  });

  it('refreshes once after a 401 and retries with the new access token', async () => {
    const store = new MemoryRefreshTokenStore();
    const postJson = vi
      .fn()
      .mockResolvedValueOnce(authResponse('access-1', 'refresh-1'))
      .mockResolvedValueOnce(authResponse('access-2', 'refresh-2'));
    const { service } = serviceWithPostJson(postJson, store);
    const request = vi
      .fn()
      .mockRejectedValueOnce(new UserLibraryApiError(401, 'GET', '/users/me', 'expired'))
      .mockResolvedValueOnce({ ok: true });

    await service.signInDevelopmentSession(developmentSessionRequest());
    postJson.mockClear();
    await expect(service.withAuthenticatedRetry(request)).resolves.toEqual({ ok: true });

    expect(request).toHaveBeenNthCalledWith(1, 'access-1');
    expect(request).toHaveBeenNthCalledWith(2, 'access-2');
    expect(postJson).toHaveBeenCalledTimes(1);
  });

  it('exposes the authenticated server scope for protected session requests', async () => {
    const store = new MemoryRefreshTokenStore();
    const postJson = vi.fn(async () => authResponse('access-1', 'refresh-1'));
    const { service } = serviceWithPostJson(postJson, store);
    const request = vi.fn(async () => ({ ok: true }));

    await service.signInDevelopmentSession(developmentSessionRequest());
    await expect(
      service.withAuthenticatedSessionRetry(request, { expectedScopeId: 'user:user-1' })
    ).resolves.toEqual({ ok: true });

    expect(request).toHaveBeenCalledWith({
      accessToken: 'access-1',
      scopeId: 'user:user-1',
    });
  });

  it('refreshes cached access when a protected session expects a different scope', async () => {
    const store = new MemoryRefreshTokenStore();
    const postJson = vi
      .fn()
      .mockResolvedValueOnce(authResponse('access-1', 'refresh-1'))
      .mockResolvedValueOnce(
        authResponse('access-2', 'refresh-2', {
          user: {
            user_uuid: 'user-2',
            username: 'ios_simulator_2',
            display_name: 'iOS Simulator 2',
            scope_id: 'user:user-2',
          },
        })
      );
    const { service } = serviceWithPostJson(postJson, store);
    const request = vi.fn(async () => ({ ok: true }));

    await service.signInDevelopmentSession(developmentSessionRequest());
    await store.setRefreshToken('refresh-2');
    await expect(
      service.withAuthenticatedSessionRetry(request, { expectedScopeId: 'user:user-2' })
    ).resolves.toEqual({ ok: true });

    expect(postJson).toHaveBeenLastCalledWith('/auth/refresh', {
      refresh_token: 'refresh-2',
    });
    expect(request).toHaveBeenCalledWith({
      accessToken: 'access-2',
      scopeId: 'user:user-2',
    });
  });

  it('does not hand callers a refreshed session for the wrong expected scope', async () => {
    const store = new MemoryRefreshTokenStore();
    const postJson = vi
      .fn()
      .mockResolvedValueOnce(authResponse('access-1', 'refresh-1'))
      .mockResolvedValueOnce(authResponse('access-2', 'refresh-2'));
    const { service } = serviceWithPostJson(postJson, store);
    const request = vi.fn(async () => ({ ok: true }));

    await service.signInDevelopmentSession(developmentSessionRequest());
    await expect(
      service.withAuthenticatedSessionRetry(request, { expectedScopeId: 'user:user-2' })
    ).resolves.toEqual({ ok: true });

    expect(request).toHaveBeenCalledWith(undefined);
  });

  it('does not treat a refresh-token 401 as a protected-request 401', async () => {
    const store = new MemoryRefreshTokenStore();
    await store.setRefreshToken('refresh-1');
    const refreshError = new UserLibraryApiError(
      401,
      'POST',
      '/api/v3/library/auth/refresh',
      'invalid_refresh_token'
    );
    const postJson = vi.fn(async () => {
      throw refreshError;
    });
    const { service } = serviceWithPostJson(postJson, store);
    const request = vi.fn();

    await expect(service.withAuthenticatedRetry(request)).rejects.toBe(refreshError);

    expect(request).not.toHaveBeenCalled();
    expect(postJson).toHaveBeenCalledTimes(1);
    await expect(store.getRefreshToken()).resolves.toBeNull();
  });

  it('does not loop when the retried request is still unauthorized', async () => {
    const store = new MemoryRefreshTokenStore();
    const postJson = vi
      .fn()
      .mockResolvedValueOnce(authResponse('access-1', 'refresh-1'))
      .mockResolvedValueOnce(authResponse('access-2', 'refresh-2'));
    const { service } = serviceWithPostJson(postJson, store);
    const request = vi.fn(async () => {
      throw new UserLibraryApiError(401, 'GET', '/users/me', 'expired');
    });

    await service.signInDevelopmentSession(developmentSessionRequest());
    postJson.mockClear();
    await expect(service.withAuthenticatedRetry(request)).rejects.toMatchObject({ status: 401 });

    expect(request).toHaveBeenCalledTimes(2);
    expect(postJson).toHaveBeenCalledTimes(1);
  });

  it('keeps sign-out authoritative over in-flight refresh responses', async () => {
    const store = new MemoryRefreshTokenStore();
    await store.setRefreshToken('refresh-1');
    let resolveRefresh: (response: UserLibraryAuthTokenResponse) => void;
    const refreshResponse = new Promise<UserLibraryAuthTokenResponse>((resolve) => {
      resolveRefresh = resolve;
    });
    const postJson = vi.fn((path: string) => {
      if (path === '/auth/refresh') {
        return refreshResponse;
      }

      if (path === '/auth/logout') {
        return Promise.resolve(undefined);
      }

      return Promise.reject(new Error(`Unexpected auth path: ${path}`));
    });
    const { service } = serviceWithPostJson(postJson, store);

    const refreshPromise = service.refreshSession();
    await flushMicrotasks();
    await expect(service.signOut()).resolves.toBeUndefined();
    resolveRefresh!(authResponse('access-2', 'refresh-2'));

    await expect(refreshPromise).rejects.toEqual(
      new UserLibraryAuthSessionError('session_changed')
    );
    await expect(store.getRefreshToken()).resolves.toBeNull();
    await expect(service.getAccessToken()).resolves.toBeUndefined();
  });

  it('clears refresh tokens after sign-out even when revoke fails', async () => {
    const store = new MemoryRefreshTokenStore();
    await store.setRefreshToken('refresh-1');
    const postJson = vi.fn(async () => {
      throw new UserLibraryApiError(401, 'POST', '/auth/logout', 'invalid_refresh_token');
    });
    const { service } = serviceWithPostJson(postJson, store);

    await expect(service.signOut()).rejects.toMatchObject({ status: 401 });

    expect(postJson).toHaveBeenCalledWith('/auth/logout', { refresh_token: 'refresh-1' });
    await expect(store.getRefreshToken()).resolves.toBeNull();
  });

  it('does not cache access tokens when refresh-token storage fails', async () => {
    const store = new MemoryRefreshTokenStore();
    store.failWritesWith = new Error('secure store write failed');
    const postJson = vi.fn(async () => authResponse('access-1', 'refresh-1'));
    const { service } = serviceWithPostJson(postJson, store);

    await expect(service.signInDevelopmentSession(developmentSessionRequest())).rejects.toThrow(
      'secure store write failed'
    );

    store.failWritesWith = undefined;
    await expect(service.getAccessToken()).resolves.toBeUndefined();
  });

  it('fails refresh explicitly when no refresh token is stored', async () => {
    const postJson = vi.fn();
    const { service } = serviceWithPostJson(postJson);

    await expect(service.refreshSession()).rejects.toEqual(
      new UserLibraryAuthSessionError('missing_refresh_token')
    );
    expect(postJson).not.toHaveBeenCalled();
  });
});
