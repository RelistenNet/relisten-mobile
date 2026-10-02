import { describe, expect, it, vi } from 'vitest';

vi.mock('./account_credentials', () => ({
  AccountCredentials: class AccountCredentials {},
}));

vi.mock('./auth/auth_client', () => ({
  AuthFlowError: class AuthFlowError extends Error {},
}));

vi.mock('@/relisten/util/logging', () => ({
  log: {
    extend: () => ({ info: vi.fn(), warn: vi.fn() }),
  },
}));

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

import { AccountAccessTokenSource } from './account_access_token_source';
import { AccountScopeCapture } from './account_scope_store';
import { AccountsApiError } from './api/accounts_api_client';

const capture: AccountScopeCapture = Object.freeze({
  scopeId: 'user:test-user',
  userUuid: 'test-user',
  generation: 1,
  nativeSessionId: 'test-session',
  isAuthenticated: true,
});

describe('AccountAccessTokenSource', () => {
  it('shares a terminal refresh and expires the session once', async () => {
    let rejectRefresh!: (error: Error) => void;
    const refresh = new Promise<never>((_, reject) => {
      rejectRefresh = reject;
    });
    const credentials = {
      freshAccessToken: vi.fn(() => null),
      activeEnvelope: vi.fn(() => ({ nativeSessionId: 'test-session' })),
      rotate: vi.fn(() => refresh),
      activate: vi.fn(),
    };
    const scopeStore = {
      isCurrent: vi.fn(() => true),
      updateProfile: vi.fn(),
    };
    const lifecycle = {
      currentEpoch: vi.fn(() => 1),
      isTransitioning: vi.fn(() => false),
      isRestoring: vi.fn(() => false),
      profileRefreshed: vi.fn(),
      sessionExpired: vi.fn().mockResolvedValue(undefined),
    };
    const source = new AccountAccessTokenSource(
      credentials as never,
      scopeStore as never,
      lifecycle
    );

    const first = source.getAccessToken(capture);
    const second = source.getAccessToken(capture);
    rejectRefresh(new AccountsApiError('Unauthorized', 401, null, false));

    const results = await Promise.allSettled([first, second]);

    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(credentials.rotate).toHaveBeenCalledOnce();
    expect(lifecycle.sessionExpired).toHaveBeenCalledOnce();
    expect(lifecycle.sessionExpired).toHaveBeenCalledWith('test-session');
    expect(scopeStore.updateProfile).not.toHaveBeenCalled();
    expect(credentials.activate).not.toHaveBeenCalled();
    expect(lifecycle.profileRefreshed).not.toHaveBeenCalled();
  });
});
