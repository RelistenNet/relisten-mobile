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
import { AccountScopeCapture, StaleAccountScopeError } from './account_scope_store';
import { AccountsApiError } from './api/accounts_api_client';

const capture: AccountScopeCapture = Object.freeze({
  scopeId: 'user_01hx3x56tafay8vvr14d2pf2db',
  userId: 'user_01hx3x56tafay8vvr14d2pf2db',
  generation: 1,
  nativeSessionId: 'session_01hx3x56tbfay8vvr14d2pf2db',
  isAuthenticated: true,
});

/** The coordinator's side of the token source: no transition or restore running. */
function lifecycle(
  overrides: Partial<ConstructorParameters<typeof AccountAccessTokenSource>[2]> = {}
) {
  return {
    currentEpoch: vi.fn(() => 1),
    isTransitioning: vi.fn(() => false),
    restoreFinished: vi.fn((): Promise<void> | null => null),
    profileRefreshed: vi.fn(),
    sessionExpired: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** A launch restore that the test finishes, optionally changing the scope as it does. */
function launchRestore() {
  let finish!: () => void;
  let running = true;
  const done = new Promise<void>((resolve) => {
    finish = () => {
      running = false;
      resolve();
    };
  });
  return { finished: () => (running ? done : null), finish: () => finish() };
}

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
    const coordinator = lifecycle();
    const source = new AccountAccessTokenSource(
      credentials as never,
      scopeStore as never,
      coordinator
    );

    const first = source.getAccessToken(capture);
    const second = source.getAccessToken(capture);
    rejectRefresh(new AccountsApiError('Unauthorized', 401, null, false));

    const results = await Promise.allSettled([first, second]);

    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(credentials.rotate).toHaveBeenCalledOnce();
    expect(coordinator.sessionExpired).toHaveBeenCalledOnce();
    expect(coordinator.sessionExpired).toHaveBeenCalledWith('session_01hx3x56tbfay8vvr14d2pf2db');
    expect(scopeStore.updateProfile).not.toHaveBeenCalled();
    expect(credentials.activate).not.toHaveBeenCalled();
    expect(coordinator.profileRefreshed).not.toHaveBeenCalled();
  });

  it('waits for the launch restore instead of failing a request made during it', async () => {
    const restore = launchRestore();
    let token: string | null = null;
    const credentials = { freshAccessToken: vi.fn(() => token), rotate: vi.fn() };
    const source = new AccountAccessTokenSource(
      credentials as never,
      { isCurrent: vi.fn(() => true) } as never,
      lifecycle({ restoreFinished: vi.fn(restore.finished) })
    );

    const pending = source.getAccessToken(capture);
    token = 'restored-token';
    restore.finish();

    await expect(pending).resolves.toBe('restored-token');
    // The restore did the one rotation; the waiting request didn't start another.
    expect(credentials.rotate).not.toHaveBeenCalled();
  });

  it('fails a waiting request as stale when the restore moves to a new scope generation', async () => {
    const restore = launchRestore();
    let current = true;
    const source = new AccountAccessTokenSource(
      { freshAccessToken: vi.fn(() => null) } as never,
      { isCurrent: vi.fn(() => current) } as never,
      lifecycle({ restoreFinished: vi.fn(restore.finished) })
    );

    const pending = source.getAccessToken(capture);
    current = false;
    restore.finish();

    await expect(pending).rejects.toBeInstanceOf(StaleAccountScopeError);
  });
});
