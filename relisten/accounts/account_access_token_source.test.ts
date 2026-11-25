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
  scopeId: 'user_01hx3x56tafay8vvr14d2pf2db',
  userId: 'user_01hx3x56tafay8vvr14d2pf2db',
  generation: 1,
  nativeSessionId: 'session_01hx3x56tbfay8vvr14d2pf2db',
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
      activeEnvelope: vi.fn(() => ({
        nativeSessionId: 'session_01hx3x56tbfay8vvr14d2pf2db',
      })),
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
      restoreFinished: vi.fn(() => null),
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
    expect(lifecycle.sessionExpired).toHaveBeenCalledWith('session_01hx3x56tbfay8vvr14d2pf2db');
    expect(scopeStore.updateProfile).not.toHaveBeenCalled();
    expect(credentials.activate).not.toHaveBeenCalled();
    expect(lifecycle.profileRefreshed).not.toHaveBeenCalled();
  });

  it('waits for the launch restore instead of failing a request made during it', async () => {
    let finishRestore!: () => void;
    let restoring = true;
    let token: string | null = null;
    const restore = new Promise<void>((resolve) => {
      finishRestore = () => {
        restoring = false;
        token = 'restored-token';
        resolve();
      };
    });
    const credentials = {
      freshAccessToken: vi.fn(() => token),
      activeEnvelope: vi.fn(),
      rotate: vi.fn(),
      activate: vi.fn(),
    };
    const lifecycle = {
      currentEpoch: vi.fn(() => 1),
      isTransitioning: vi.fn(() => false),
      isRestoring: vi.fn(() => restoring),
      restoreFinished: vi.fn(() => (restoring ? restore : null)),
      profileRefreshed: vi.fn(),
      sessionExpired: vi.fn(),
    };
    const source = new AccountAccessTokenSource(
      credentials as never,
      { isCurrent: vi.fn(() => true), updateProfile: vi.fn() } as never,
      lifecycle
    );

    const pending = source.getAccessToken(capture);
    finishRestore();

    await expect(pending).resolves.toBe('restored-token');
    // The restore did the one rotation; the waiting request didn't start another.
    expect(credentials.rotate).not.toHaveBeenCalled();
  });

  it('reports a restore that is running without a promise to wait on', async () => {
    const source = new AccountAccessTokenSource(
      { freshAccessToken: vi.fn(() => null) } as never,
      { isCurrent: vi.fn(() => true) } as never,
      {
        currentEpoch: vi.fn(() => 1),
        isTransitioning: vi.fn(() => false),
        isRestoring: vi.fn(() => true),
        restoreFinished: vi.fn(() => null),
        profileRefreshed: vi.fn(),
        sessionExpired: vi.fn(),
      }
    );

    await expect(source.getAccessToken(capture)).rejects.toMatchObject({
      code: 'session_restore_in_progress',
    });
  });
});
