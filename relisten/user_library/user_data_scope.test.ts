import { describe, expect, it } from 'vitest';
import {
  anonymousUserDataScopeId,
  authenticatedUserDataScopeId,
  DEFAULT_ANONYMOUS_DEVICE_ID,
  externalUserDataScopeId,
  scopedUserDataPrimaryKey,
  userDataScopeId,
  UserDataScopeKind,
} from '@/relisten/user_library/user_data_scope';

describe('user data scope ids', () => {
  it('builds deterministic anonymous, user, and external scope ids', () => {
    expect(anonymousUserDataScopeId()).toBe(`anonymous:${DEFAULT_ANONYMOUS_DEVICE_ID}`);
    expect(anonymousUserDataScopeId(' iOS Simulator ')).toBe('anonymous:iOS%20Simulator');
    expect(authenticatedUserDataScopeId('user-1')).toBe('user:user-1');
    expect(externalUserDataScopeId('google', 'person@example.com')).toBe(
      'external:google:person%40example.com'
    );
  });

  it('builds ids from descriptors without changing authenticated primary keys later', () => {
    expect(
      userDataScopeId({
        kind: UserDataScopeKind.Authenticated,
        userUuid: 'local-user-uuid',
      })
    ).toBe('user:local-user-uuid');
  });

  it('escapes local row ids inside scoped primary keys', () => {
    expect(scopedUserDataPrimaryKey('user:user-1', 'playlist:1')).toBe(
      'user%3Auser-1:playlist%3A1'
    );
  });

  it('rejects empty scope parts', () => {
    expect(() => authenticatedUserDataScopeId(' ')).toThrow('userUuid cannot be empty');
    expect(() => scopedUserDataPrimaryKey('user:user-1', '')).toThrow('localId cannot be empty');
  });
});
