import { describe, expect, it, vi } from 'vitest';

const browser = vi.hoisted(() => ({
  openAuthSessionAsync: vi.fn(),
}));
vi.mock('expo-web-browser', () => browser);

vi.mock('expo-auth-session', () => ({
  TokenError: class TokenError extends Error {},
}));

vi.mock('./auth_client', () => ({
  AuthFlowError: class AuthFlowError extends Error {},
}));

vi.mock('./pkce_transaction', () => ({
  clearPendingAuthTransaction: vi.fn(),
  isExpiredAuthTransaction: vi.fn(),
  readPendingAuthTransaction: vi.fn(),
  writePendingAuthTransaction: vi.fn(),
}));

import { NativeAuthFlow } from './native_auth_flow';

describe('NativeAuthFlow', () => {
  it('opens the production iOS callback as a universal link', async () => {
    const transaction = {
      redirectUri: 'https://relisten.net/auth/mobile/ios/callback',
    };
    const authClient = {
      config: { useUniversalLinkCallback: true },
      prepareAuthorization: vi.fn().mockResolvedValue({
        authorizationUrl: 'https://auth.relisten.net/connect/authorize',
        transaction,
      }),
    };
    browser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'https://relisten.net/auth/mobile/ios/callback?code=test&state=test',
    });

    await new NativeAuthFlow(authClient as never).open('google');

    expect(browser.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://auth.relisten.net/connect/authorize',
      'https://relisten.net/auth/mobile/ios/callback',
      { preferUniversalLinks: true }
    );
  });
});
