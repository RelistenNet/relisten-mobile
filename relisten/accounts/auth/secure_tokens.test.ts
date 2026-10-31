import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = vi.hoisted(() => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  ...secureStore,
}));

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

import { readRefreshTokenEnvelope } from './secure_tokens';

const typedEnvelope = {
  version: 1,
  refreshToken: 'refresh-token',
  issuer: 'https://auth.relisten.net',
  clientId: 'relisten-mobile-ios',
  userId: 'user_01hx3x56tafay8vvr14d2pf2db',
  nativeSessionId: 'session_01hx3x56tbfay8vvr14d2pf2db',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('stored account credentials', () => {
  it('accepts only complete canonical typed identities', async () => {
    secureStore.getItemAsync.mockResolvedValue(JSON.stringify(typedEnvelope));

    await expect(readRefreshTokenEnvelope()).resolves.toEqual({
      state: 'available',
      value: typedEnvelope,
    });
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('rejects the old raw-UUID envelope without racing a later credential write', async () => {
    secureStore.getItemAsync.mockResolvedValue(
      JSON.stringify({
        ...typedEnvelope,
        userId: undefined,
        userUuid: '018f47d2-9b4a-7abc-8def-0123456789ab',
        nativeSessionId: '018f47d2-9b4b-7abc-8def-0123456789ab',
      })
    );

    await expect(readRefreshTokenEnvelope()).resolves.toEqual({ state: 'missing' });
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});
