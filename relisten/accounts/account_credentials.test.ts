import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureTokens = vi.hoisted(() => ({
  clear: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));

vi.mock('./auth/secure_tokens', () => ({
  clearRefreshTokenEnvelope: secureTokens.clear,
  readRefreshTokenEnvelope: secureTokens.read,
  writeRefreshTokenEnvelope: secureTokens.write,
}));

vi.mock('./auth/auth_client', () => ({
  AuthFlowError: class AuthFlowError extends Error {
    constructor(
      message: string,
      readonly code: string
    ) {
      super(message);
    }
  },
}));

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

import { AccountCredentials } from './account_credentials';
import { RefreshTokenEnvelope } from './auth/account_auth_types';

const userUuid = '018f47d2-9b4a-7abc-8def-0123456789ab';
const nativeSessionId = '018f47d2-9b4b-7abc-8def-0123456789ab';

const envelope: RefreshTokenEnvelope = {
  version: 1,
  refreshToken: 'old-refresh-token',
  issuer: 'https://auth.relisten.net',
  clientId: 'relisten-mobile-ios',
  userUuid,
  nativeSessionId,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AccountCredentials', () => {
  it('persists a rotated refresh token before validating the access token', async () => {
    let finishWrite!: () => void;
    secureTokens.write.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve;
        })
    );
    const authClient = {
      config: { issuer: envelope.issuer, clientId: envelope.clientId },
      refresh: vi.fn().mockResolvedValue({
        accessToken: 'new-access-token',
        accessTokenExpiresAt: new Date('2026-08-28T00:00:00.000Z'),
        refreshToken: 'new-refresh-token',
        subject: userUuid,
        nativeSessionId,
      }),
    };
    const transport = {
      request: vi.fn().mockResolvedValue({
        contract_version: 1,
        user_uuid: userUuid,
        username: 'test_listener',
        username_version: 1,
        username_review_needed: false,
        username_reviewed_at: null,
        username_change_available_at: null,
        native_session_uuid: nativeSessionId,
      }),
    };
    const credentials = new AccountCredentials(authClient as never, transport as never);

    const rotation = credentials.rotate(envelope);
    await vi.waitFor(() => expect(secureTokens.write).toHaveBeenCalledOnce());

    expect(secureTokens.write).toHaveBeenCalledWith({
      ...envelope,
      refreshToken: 'new-refresh-token',
    });
    expect(transport.request).not.toHaveBeenCalled();

    finishWrite();
    const result = await rotation;

    expect(transport.request).toHaveBeenCalledWith('/v1/me', 'new-access-token', {
      method: 'GET',
    });
    expect(result.envelope.refreshToken).toBe('new-refresh-token');
  });
});
