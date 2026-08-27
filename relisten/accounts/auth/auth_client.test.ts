import { beforeEach, describe, expect, it, vi } from 'vitest';

const authSession = vi.hoisted(() => ({
  requestConfigs: [] as Record<string, unknown>[],
}));

vi.mock('expo-auth-session', () => ({
  AuthRequest: class AuthRequest {
    state = 'test-state';
    codeVerifier = 'test-code-verifier';

    constructor(config: Record<string, unknown>) {
      authSession.requestConfigs.push(config);
    }

    getAuthRequestConfigAsync = vi.fn().mockResolvedValue(undefined);
    makeAuthUrlAsync = vi.fn().mockResolvedValue('https://auth.relisten.net/connect/authorize');
  },
  CodeChallengeMethod: { S256: 'S256' },
  Prompt: { SelectAccount: 'select_account' },
  ResponseType: { Code: 'code' },
  exchangeCodeAsync: vi.fn(),
  fetchDiscoveryAsync: vi.fn().mockResolvedValue({
    authorizationEndpoint: 'https://auth.relisten.net/connect/authorize',
    tokenEndpoint: 'https://auth.relisten.net/connect/token',
    revocationEndpoint: 'https://auth.relisten.net/connect/revoke',
    discoveryDocument: { issuer: 'https://auth.relisten.net' },
  }),
  refreshAsync: vi.fn(),
}));

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: vi.fn().mockResolvedValue(new Uint8Array(32)),
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

vi.mock('@/relisten/util/logging', () => ({
  log: {
    extend: () => ({ warn: vi.fn() }),
  },
}));

vi.mock('./pkce_transaction', () => ({
  authTransactionExpiry: (createdAt: Date) => new Date(createdAt.getTime() + 10 * 60 * 1000),
}));

import { AccountAuthClient } from './auth_client';
import { AccountProvider } from './account_auth_types';

beforeEach(() => {
  authSession.requestConfigs.length = 0;
});

describe('AccountAuthClient', () => {
  it.each<AccountProvider>(['apple', 'google'])(
    'requires explicit account selection for %s authorization',
    async (provider) => {
      const client = new AccountAuthClient({
        issuer: 'https://auth.relisten.net',
        accountsOrigin: 'https://accounts.relisten.net',
        clientId: 'relisten-mobile-ios',
        redirectUri: 'https://relisten.net/auth/mobile/ios/callback',
        useUniversalLinkCallback: true,
      });

      const authorization = await client.prepareAuthorization(provider);

      expect(authSession.requestConfigs).toHaveLength(1);
      expect(authSession.requestConfigs[0]).toMatchObject({
        clientId: 'relisten-mobile-ios',
        redirectUri: 'https://relisten.net/auth/mobile/ios/callback',
        prompt: 'select_account',
        responseType: 'code',
        usePKCE: true,
        codeChallengeMethod: 'S256',
        extraParams: {
          provider,
        },
      });
      expect(authorization.transaction.provider).toBe(provider);
      expect(authorization.transaction.redirectUri).toBe(
        'https://relisten.net/auth/mobile/ios/callback'
      );
    }
  );
});
