import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

import { parseAccountProfileResponse } from './account_profile';

const profileResponse = {
  contract_version: 1,
  user_id: 'user_01hx3x56tafay8vvr14d2pf2db',
  username: 'test_listener',
  username_version: 3,
  username_review_needed: false,
  username_reviewed_at: '2026-10-01T00:00:00.000Z',
  username_change_available_at: null,
  native_session_id: 'session_01hx3x56tbfay8vvr14d2pf2db',
};

describe('parseAccountProfileResponse', () => {
  it('keeps canonical typed user and native-session identities intact', () => {
    expect(parseAccountProfileResponse(profileResponse)).toMatchObject({
      userId: profileResponse.user_id,
      nativeSessionId: profileResponse.native_session_id,
      username: 'test_listener',
      usernameVersion: 3,
    });
  });

  it.each([
    { ...profileResponse, user_id: '018f47d2-9b4a-7abc-8def-0123456789ab' },
    { ...profileResponse, user_id: profileResponse.native_session_id },
    { ...profileResponse, native_session_id: profileResponse.user_id },
  ])('rejects raw UUIDs and wrong-prefix account identities', (response) => {
    expect(() => parseAccountProfileResponse(response)).toThrow(/invalid (user|native_session)_id/);
  });
});
