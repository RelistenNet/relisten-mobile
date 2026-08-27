import { describe, expect, it, vi } from 'vitest';

const browser = vi.hoisted(() => ({
  openAuthSessionAsync: vi.fn(),
}));
const pendingTransaction = vi.hoisted(() => ({
  write: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('expo-web-browser', () => browser);

vi.mock('expo-auth-session', () => ({
  TokenError: class TokenError extends Error {},
}));

vi.mock('./auth_client', () => ({
  AuthFlowError: class AuthFlowError extends Error {},
}));

vi.mock('./pkce_transaction', () => ({
  clearPendingAuthTransaction: pendingTransaction.clear,
  isExpiredAuthTransaction: vi.fn(),
  readPendingAuthTransaction: vi.fn(),
  writePendingAuthTransaction: pendingTransaction.write,
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

    const result = await new NativeAuthFlow(authClient as never).open('google');

    expect(pendingTransaction.write).toHaveBeenCalledWith(transaction);
    expect(browser.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://auth.relisten.net/connect/authorize',
      'https://relisten.net/auth/mobile/ios/callback',
      { preferUniversalLinks: true }
    );
    expect(result).toEqual({
      type: 'callback',
      callbackUrl: 'https://relisten.net/auth/mobile/ios/callback?code=test&state=test',
    });
  });
});
