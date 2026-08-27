import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pendingTransaction = vi.hoisted(() => ({ clear: vi.fn() }));

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
  clearPendingAuthTransaction: pendingTransaction.clear,
}));

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

import { AccountSessionCoordinator } from './account_session_coordinator';
import { AccountsApiError } from './api/accounts_api_client';
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
      scopeId: 'user:test-user',
      userUuid: 'test-user',
      generation: 1,
      nativeSessionId: 'test-session',
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
      activeEnvelope: vi.fn(() => ({ nativeSessionId: 'test-session' })),
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
    expect(transitionEffects.beforeLeavingAuthenticatedScope).toHaveBeenCalledOnce();
    expect(credentials.clearMemory).toHaveBeenCalledOnce();
    expect(credentials.clearPersisted).toHaveBeenCalledOnce();
    expect(pendingTransaction.clear).toHaveBeenCalledOnce();
    expect(coordinator.scopeSource.getSnapshot()).toMatchObject({
      scopeId: 'anonymous',
      userUuid: null,
      nativeSessionId: null,
      isAuthenticated: false,
    });
    expect(realmScope.blockedNativeSessionId).toBe('test-session');
    expect(vi.getTimerCount()).toBe(0);
  });
});
