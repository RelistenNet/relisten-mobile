import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Realm from 'realm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ActiveUserDataScope,
  UserAuthSessionMetadata,
  UserPlaylist,
  UserPlaylistVisibility,
} from '@/relisten/realm/models/user_library';
import {
  getActiveUserDataScope,
  scopedRealmObjectForPrimaryKey,
} from '@/relisten/user_library/active_user_data_scope_service';
import {
  UserLibraryAuthSessionError,
  UserLibraryAuthTokenResponse,
} from '@/relisten/user_library/auth_session';
import {
  userLibrarySessionMetadataScopedId,
  UserLibraryAuthSessionRealmService,
} from '@/relisten/user_library/auth_session_realm_service';
import {
  scopedUserDataPrimaryKey,
  UserDataScopeKind,
} from '@/relisten/user_library/user_data_scope';

const schema = [ActiveUserDataScope, UserAuthSessionMetadata, UserPlaylist];

function authResponse(
  overrides: Partial<UserLibraryAuthTokenResponse> = {}
): UserLibraryAuthTokenResponse {
  return {
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    access_token_expires_at: '2026-06-20T05:00:00.000Z',
    refresh_token_expires_at: '2027-06-20T05:00:00.000Z',
    user: {
      user_uuid: 'user-1',
      username: 'ios_simulator',
      display_name: 'iOS Simulator',
      scope_id: 'user:user-1',
    },
    session: {
      session_uuid: 'session-1',
      device_id: 'device-1',
      device_name: 'iPhone Simulator',
      platform: 'ios',
      created_at: '2026-06-20T04:00:00.000Z',
      last_used_at: '2026-06-20T04:01:00.000Z',
    },
    ...overrides,
  };
}

describe('UserLibraryAuthSessionRealmService', () => {
  let realm: Realm;
  let service: UserLibraryAuthSessionRealmService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'relisten-auth-session-'));
    realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema,
      schemaVersion: 1,
    });
    service = new UserLibraryAuthSessionRealmService(realm);
  });

  afterEach(() => {
    realm.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('persists sign-in metadata and switches to the authenticated scope', () => {
    const authenticatedAt = new Date('2026-06-20T04:02:00.000Z');
    const metadata = service.applySignInResponse(authResponse(), {
      authenticatedAt,
      provider: 'development',
    });
    const activeScope = getActiveUserDataScope(realm);

    expect(activeScope).toEqual(
      expect.objectContaining({
        scopeId: 'user:user-1',
        scopeKind: UserDataScopeKind.Authenticated,
        userUuid: 'user-1',
        displayName: 'iOS Simulator',
        lastActivatedAt: new Date('2026-06-20T04:01:00.000Z'),
      })
    );
    expect(metadata).toEqual(
      expect.objectContaining({
        scopedId: userLibrarySessionMetadataScopedId('user:user-1', 'session-1'),
        scopeId: 'user:user-1',
        userUuid: 'user-1',
        sessionUuid: 'session-1',
        deviceId: 'device-1',
        provider: 'development',
        username: 'ios_simulator',
        displayName: 'iOS Simulator',
        lastAuthenticatedAt: authenticatedAt,
      })
    );
    expect(metadata.lastRefreshAt).toBeNull();
    expect(Object.keys(UserAuthSessionMetadata.schema.properties)).not.toEqual(
      expect.arrayContaining(['accessToken', 'refreshToken'])
    );
  });

  it('updates refresh metadata without changing the original authentication time', () => {
    const authenticatedAt = new Date('2026-06-20T04:02:00.000Z');
    service.applySignInResponse(authResponse(), { authenticatedAt, provider: 'development' });

    const refreshedAt = new Date('2026-06-20T04:05:00.000Z');
    const metadata = service.applyRefreshResponse(
      authResponse({
        access_token: 'access-2',
        refresh_token: 'refresh-2',
        session: {
          ...authResponse().session,
          last_used_at: '2026-06-20T04:04:30.000Z',
        },
      }),
      {
        refreshedAt,
      }
    );

    expect(metadata.lastAuthenticatedAt).toEqual(authenticatedAt);
    expect(metadata.lastRefreshAt).toEqual(refreshedAt);
    expect(metadata.provider).toBe('development');
    expect(realm.objects(UserAuthSessionMetadata).length).toBe(1);
  });

  it('can bootstrap non-secret session metadata from a refresh response', () => {
    const refreshedAt = new Date('2026-06-20T04:05:00.000Z');
    const metadata = service.applyRefreshResponse(authResponse(), { refreshedAt });

    expect(metadata).toEqual(
      expect.objectContaining({
        scopeId: 'user:user-1',
        sessionUuid: 'session-1',
        lastAuthenticatedAt: new Date('2026-06-20T04:00:00.000Z'),
        lastRefreshAt: refreshedAt,
      })
    );
    expect(getActiveUserDataScope(realm)).toEqual(
      expect.objectContaining({
        scopeId: 'user:user-1',
        scopeKind: UserDataScopeKind.Authenticated,
      })
    );
  });

  it('rejects token responses whose server scope does not match the user uuid', () => {
    const mismatched = authResponse({
      user: {
        ...authResponse().user,
        scope_id: 'user:other-user',
      },
    });

    expect(() => service.applySignInResponse(mismatched)).toThrowError(
      new UserLibraryAuthSessionError('scope_mismatch')
    );
    expect(getActiveUserDataScope(realm)).toBeNull();
    expect(realm.objects(UserAuthSessionMetadata).length).toBe(0);
  });

  it('does not let stale refresh responses reactivate a signed-out session', () => {
    service.applySignInResponse(authResponse());
    service.markSignedOut({
      scopeId: 'user:user-1',
      sessionUuid: 'session-1',
    });

    expect(() => service.applyRefreshResponse(authResponse())).toThrowError(
      new UserLibraryAuthSessionError('session_signed_out')
    );
    expect(getActiveUserDataScope(realm)).toEqual(
      expect.objectContaining({
        scopeId: 'anonymous:local-device',
        scopeKind: UserDataScopeKind.Anonymous,
      })
    );
  });

  it('marks the current session signed out without deleting scoped rows', () => {
    service.applySignInResponse(authResponse());

    realm.write(() => {
      realm.create(UserPlaylist, {
        scopedId: scopedUserDataPrimaryKey('user:user-1', 'playlist-1'),
        scopeId: 'user:user-1',
        uuid: 'playlist-1',
        name: 'Signed-in playlist',
        visibility: UserPlaylistVisibility.Private,
        currentRevision: 1,
        createdAt: new Date('2026-06-20T04:00:00.000Z'),
        updatedAt: new Date('2026-06-20T04:00:00.000Z'),
      });
    });

    const signedOutAt = new Date('2026-06-20T04:10:00.000Z');
    const metadata = service.markSignedOut(
      {
        scopeId: 'user:user-1',
        sessionUuid: 'session-1',
      },
      {
        anonymousDeviceId: 'device-1',
        signedOutAt,
      }
    );

    expect(metadata?.signedOutAt).toEqual(signedOutAt);
    expect(getActiveUserDataScope(realm)).toEqual(
      expect.objectContaining({
        scopeId: 'anonymous:device-1',
        scopeKind: UserDataScopeKind.Anonymous,
      })
    );
    expect(
      scopedRealmObjectForPrimaryKey(realm, UserPlaylist.schema.name, 'user:user-1', 'playlist-1')
    ).toEqual(expect.objectContaining({ name: 'Signed-in playlist' }));
  });
});
