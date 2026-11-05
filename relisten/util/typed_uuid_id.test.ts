import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

import { formatUuidTypedId, isUuidV7TypedId, parseUuidTypedId } from './typed_uuid_id';

describe('UUID-backed typed IDs', () => {
  it('matches the published U26 byte-order vector', () => {
    const uuid = '01890a5d-ac96-774b-bcce-b302099a8057';

    expect(formatUuidTypedId('user', uuid)).toBe('user_01h455vb4pex5vsknk084sn02q');
    expect(parseUuidTypedId('user_01h455vb4pex5vsknk084sn02q', 'user')).toBe(uuid);
  });

  it('requires the expected prefix, canonical alphabet, and UUIDv7 bits', () => {
    expect(isUuidV7TypedId('user_01h455vb4pex5vsknk084sn02q', 'user')).toBe(true);
    expect(isUuidV7TypedId('session_01h455vb4pex5vsknk084sn02q', 'user')).toBe(false);
    expect(isUuidV7TypedId('user_01h455vb4pex5vsknk084sn02I', 'user')).toBe(false);
    expect(isUuidV7TypedId('user_00000000000000000000000000', 'user')).toBe(false);
  });
});
