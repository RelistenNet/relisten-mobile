import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/util/logging', () => ({
  log: {
    extend: () => ({ info: vi.fn(), warn: vi.fn() }),
  },
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

vi.mock('expo-auth-session', () => ({
  AuthRequest: class AuthRequest {},
  CodeChallengeMethod: { S256: 'S256' },
  Prompt: { SelectAccount: 'select_account' },
  ResponseType: { Code: 'code' },
  TokenError: class TokenError extends Error {},
  exchangeCodeAsync: vi.fn(),
  fetchDiscoveryAsync: vi.fn(),
  refreshAsync: vi.fn(),
}));

vi.mock('expo-web-browser', () => ({
  openAuthSessionAsync: vi.fn(),
}));

vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

vi.mock('./account_config', () => ({
  getAccountRuntimeConfig: () => ({
    issuer: 'https://auth.relisten.net',
    accountsOrigin: 'https://accounts.relisten.net',
    clientId: 'relisten-mobile-ios',
    redirectUri: 'https://relisten.net/auth/mobile/ios/callback',
    useUniversalLinkCallback: true,
  }),
}));

vi.mock('./auth/pkce_transaction', () => ({
  authTransactionExpiry: (createdAt: Date) => createdAt,
  clearPendingAuthTransaction: vi.fn(),
}));

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

vi.mock('./account_local_data', () => ({
  forgetDeletedAccount: vi.fn(),
  hideUnconfirmedAccount: vi.fn(),
}));

import { forgetDeletedAccount, hideUnconfirmedAccount } from './account_local_data';
import { AccountSessionCoordinator } from './account_session_coordinator';
import { AccountsApiError } from './api/accounts_api_client';
import { StaleAccountScopeError } from './account_scope_store';
import { AccountLogoutRequest } from './api/account_logout_request';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AccountSessionCoordinator', () => {
  it('clears the local session after remote logout retries are exhausted', async () => {
    const realmScope = {
      scopeId: 'user_01hx3x56tafay8vvr14d2pf2db',
      userId: 'user_01hx3x56tafay8vvr14d2pf2db',
      generation: 1,
      nativeSessionId: 'session_01hx3x56tbfay8vvr14d2pf2db',
      blockedNativeSessionId: undefined as string | undefined,
      updatedAt: new Date(),
    };
    const realm = {
      objectForPrimaryKey: vi.fn(() => realmScope),
      write: vi.fn((change: () => void) => change()),
    };
    const transitionEffects = {
      beforeLeavingAuthenticatedScope: vi.fn().mockResolvedValue(undefined),
    };
    const coordinator = new AccountSessionCoordinator(realm as never, transitionEffects);
    const credentials = {
      activeEnvelope: vi.fn(() => ({
        nativeSessionId: 'session_01hx3x56tbfay8vvr14d2pf2db',
      })),
      accessTokenForLogout: vi.fn().mockResolvedValue('access-token'),
      clearMemory: vi.fn(),
      clearPersisted: vi.fn().mockResolvedValue(undefined),
    };
    const transport = {
      request: vi.fn().mockRejectedValue(new AccountsApiError('Busy', 503, null, true)),
    };
    Reflect.set(coordinator, 'credentials', credentials);
    Reflect.set(coordinator, 'logoutRequest', new AccountLogoutRequest(transport as never));

    const signOut = coordinator.signOut();
    await vi.advanceTimersByTimeAsync(1000);
    await signOut;

    expect(transport.request).toHaveBeenCalledTimes(3);
    expect(credentials.clearMemory).toHaveBeenCalledOnce();
    expect(credentials.clearPersisted).toHaveBeenCalledOnce();
    expect(coordinator.scopeSource.getSnapshot()).toMatchObject({
      scopeId: 'anonymous',
      userId: null,
      nativeSessionId: null,
      isAuthenticated: false,
    });
    expect(realmScope.blockedNativeSessionId).toBe('session_01hx3x56tbfay8vvr14d2pf2db');
  });

  describe('deleteAccount', () => {
    const userId = 'user_01hx3x56tafay8vvr14d2pf2db';
    const sessionId = 'session_01hx3x56tbfay8vvr14d2pf2db';

    function signedInCoordinator(send: () => Promise<string>) {
      const realmScope = {
        scopeId: userId,
        userId,
        generation: 1,
        nativeSessionId: sessionId,
        blockedNativeSessionId: undefined as string | undefined,
        updatedAt: new Date(),
      };
      const realm = {
        objectForPrimaryKey: vi.fn(() => realmScope),
        write: vi.fn((change: () => void) => change()),
      };
      const transitionEffects = {
        beforeLeavingAuthenticatedScope: vi.fn().mockResolvedValue(undefined),
      };
      const coordinator = new AccountSessionCoordinator(realm as never, transitionEffects);
      const credentials = {
        activeEnvelope: vi.fn(() => ({ nativeSessionId: sessionId })),
        clearMemory: vi.fn(),
        clearPersisted: vi.fn().mockResolvedValue(undefined),
      };
      Reflect.set(coordinator, 'credentials', credentials);
      Reflect.set(coordinator, 'deletionRequest', { send: vi.fn(send) });
      return { coordinator, credentials, realm, realmScope, transitionEffects };
    }

    it('signs out and forgets the account once the server accepts', async () => {
      const { coordinator, credentials, realm, realmScope, transitionEffects } =
        signedInCoordinator(async () => 'accepted');

      await expect(coordinator.deleteAccount()).resolves.toBe('deleting');

      expect(transitionEffects.beforeLeavingAuthenticatedScope).toHaveBeenCalledOnce();
      expect(credentials.clearPersisted).toHaveBeenCalledOnce();
      expect(forgetDeletedAccount).toHaveBeenCalledExactlyOnceWith(realm, userId);
      expect(hideUnconfirmedAccount).not.toHaveBeenCalled();
      expect(realmScope.blockedNativeSessionId).toBe(sessionId);
      expect(coordinator.getSnapshot()).toMatchObject({
        status: 'signedOut',
        error: null,
        activeScope: { isAuthenticated: false },
      });
    });

    it('keeps the account hidden but intact when the session already ended', async () => {
      const { coordinator, credentials, realm } = signedInCoordinator(async () => 'sessionEnded');

      await expect(coordinator.deleteAccount()).resolves.toBe('unconfirmed');

      expect(forgetDeletedAccount).not.toHaveBeenCalled();
      expect(hideUnconfirmedAccount).toHaveBeenCalledExactlyOnceWith(realm, userId);
      expect(credentials.clearPersisted).toHaveBeenCalledOnce();
      expect(coordinator.getSnapshot()).toMatchObject({
        status: 'error',
        error: { code: 'account_deletion_unconfirmed' },
        activeScope: { isAuthenticated: false },
      });
    });

    it('hides the account when the session ends while the request is in flight', async () => {
      const { coordinator, realm } = signedInCoordinator(async () => {
        // A background sync found the session gone and expired it.
        coordinator.scopeSource.selectAnonymous(true);
        throw new StaleAccountScopeError();
      });

      await expect(coordinator.deleteAccount()).resolves.toBe('unconfirmed');

      expect(forgetDeletedAccount).not.toHaveBeenCalled();
      expect(hideUnconfirmedAccount).toHaveBeenCalledExactlyOnceWith(realm, userId);
    });

    it('refuses to sign out while the request is in flight', async () => {
      const { coordinator } = signedInCoordinator(() => new Promise(() => undefined));

      void coordinator.deleteAccount();

      expect(() => coordinator.signOut()).toThrow('in progress');
    });

    it('stays signed in when the request fails', async () => {
      const failure = new AccountsApiError('Offline', null, 'account_deletion_failed', true);
      const { coordinator, credentials } = signedInCoordinator(() => Promise.reject(failure));

      await expect(coordinator.deleteAccount()).rejects.toBe(failure);

      expect(credentials.clearPersisted).not.toHaveBeenCalled();
      expect(forgetDeletedAccount).not.toHaveBeenCalled();
      expect(hideUnconfirmedAccount).not.toHaveBeenCalled();
      expect(coordinator.scopeSource.getSnapshot().isAuthenticated).toBe(true);
    });
  });
});
