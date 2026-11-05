import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

import type { PendingAuthTransaction } from './account_auth_types';
import { validateInitialIdToken } from './auth_validation';

const transaction: PendingAuthTransaction = {
  version: 1,
  transactionId: 'test-transaction',
  provider: 'google',
  issuer: 'https://auth.relisten.net',
  clientId: 'relisten-mobile-ios',
  redirectUri: 'net.relisten.mobile:/oauth2redirect/ios',
  state: 'test-state',
  nonce: 'test-nonce',
  codeVerifier: 'test-verifier',
  createdAt: '2026-10-31T00:00:00.000Z',
  expiresAt: '2026-10-31T00:10:00.000Z',
};

const claims = {
  iss: transaction.issuer,
  aud: transaction.clientId,
  sub: 'user_01hx3x56tafay8vvr14d2pf2db',
  sid: 'session_01hx3x56tbfay8vvr14d2pf2db',
  exp: Math.floor(Date.now() / 1000) + 60,
  nonce: transaction.nonce,
};

function idToken(payload: Record<string, unknown>) {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  return `${encode({ alg: 'none' })}.${encode(payload)}.signature`;
}

describe('validateInitialIdToken', () => {
  it('returns complete typed subject and session claims', () => {
    expect(validateInitialIdToken(idToken(claims), transaction)).toEqual({
      subject: claims.sub,
      nativeSessionId: claims.sid,
    });
  });

  it('accepts an omitted session claim for an ID token', () => {
    expect(validateInitialIdToken(idToken({ ...claims, sid: undefined }), transaction)).toEqual({
      subject: claims.sub,
      nativeSessionId: null,
    });
  });

  it.each([
    { ...claims, sub: '018f47d2-9b4a-7abc-8def-0123456789ab' },
    { ...claims, sub: claims.sid },
    { ...claims, sid: null },
    { ...claims, sid: '018f47d2-9b4b-7abc-8def-0123456789ab' },
    { ...claims, sid: claims.sub },
  ])('rejects raw UUIDs and wrong-prefix identity claims', (invalidClaims) => {
    expect(() => validateInitialIdToken(idToken(invalidClaims), transaction)).toThrow(
      /identity token (subject|session) is invalid/i
    );
  });
});
