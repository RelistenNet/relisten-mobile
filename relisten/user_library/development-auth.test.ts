import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Realm from 'realm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActiveUserDataScope,
  UserAuthSessionMetadata,
  UserPlaylist,
  UserPlaylistVisibility,
} from '@/relisten/realm/models/user_library';
import { UserLibraryAuthTokenResponse } from '@/relisten/user_library/auth_session';
import {
  currentUserLibrarySessionMetadata,
  defaultDevelopmentSessionRequest,
  UserLibraryDevelopmentAuthController,
  UserLibraryDevelopmentAuthSession,
} from '@/relisten/user_library/development_auth';
import {
  getActiveUserDataScope,
  setActiveUserDataScope,
} from '@/relisten/user_library/active_user_data_scope_service';
import {
  scopedUserDataPrimaryKey,
  UserDataScopeKind,
} from '@/relisten/user_library/user_data_scope';

const schema = [ActiveUserDataScope, UserAuthSessionMetadata, UserPlaylist];
const USER_UUID = '33333333-3333-4333-8333-333333333333';
const SCOPE_ID = `user:${USER_UUID}`;

class FakeDevelopmentAuthSession implements UserLibraryDevelopmentAuthSession {
  signInDevelopmentSession = vi.fn(async () => authResponse());
  signOut = vi.fn(async () => {});
}

describe('UserLibraryDevelopmentAuthController', () => {
  let realm: Realm;
  let tempDir: string;
  let authSession: FakeDevelopmentAuthSession;
  let controller: UserLibraryDevelopmentAuthController;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'relisten-development-auth-'));
    realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema,
      schemaVersion: 1,
    });
    authSession = new FakeDevelopmentAuthSession();
    controller = new UserLibraryDevelopmentAuthController(realm, authSession);
  });

  afterEach(() => {
    realm.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('builds a trimmed default development session request', () => {
    expect(defaultDevelopmentSessionRequest(' ios_user ')).toEqual({
      username: 'ios_user',
      display_name: 'ios_user',
      device_id: 'ios-development-device',
      device_name: 'Relisten Development Device',
      platform: 'ios',
    });
  });

  it('signs in through the real auth service boundary and applies Realm metadata', async () => {
    await expect(
      controller.signIn({
        username: ' ios_user ',
        displayName: ' iOS User ',
        deviceId: ' device-1 ',
        deviceName: ' iPhone Simulator ',
        platform: 'ios',
        authenticatedAt: new Date('2026-06-20T06:10:00.000Z'),
      })
    ).resolves.toEqual(
      expect.objectContaining({
        scopeId: SCOPE_ID,
        sessionUuid: 'session-1',
        deviceId: 'device-1',
        provider: 'development',
        username: 'ios_user',
        displayName: 'iOS User',
        lastAuthenticatedAt: new Date('2026-06-20T06:10:00.000Z'),
      })
    );

    expect(authSession.signInDevelopmentSession).toHaveBeenCalledWith({
      username: 'ios_user',
      display_name: 'iOS User',
      device_id: 'device-1',
      device_name: 'iPhone Simulator',
      platform: 'ios',
    });
    expect(getActiveUserDataScope(realm)).toEqual(
      expect.objectContaining({
        scopeId: SCOPE_ID,
        scopeKind: UserDataScopeKind.Authenticated,
      })
    );
    expect(currentUserLibrarySessionMetadata(realm)).toEqual(
      expect.objectContaining({ sessionUuid: 'session-1' })
    );
  });

  it('signs out without deleting scoped rows and returns to anonymous scope', async () => {
    await controller.signIn({ username: 'ios_user', deviceId: 'device-1' });
    realm.write(() => {
      realm.create(UserPlaylist, {
        scopedId: scopedUserDataPrimaryKey(SCOPE_ID, 'playlist-1'),
        scopeId: SCOPE_ID,
        uuid: 'playlist-1',
        name: 'Signed-in playlist',
        visibility: UserPlaylistVisibility.Private,
        currentRevision: 1,
        createdAt: new Date('2026-06-20T06:00:00.000Z'),
        updatedAt: new Date('2026-06-20T06:00:00.000Z'),
      });
    });

    await expect(
      controller.signOut({ signedOutAt: new Date('2026-06-20T06:12:00.000Z') })
    ).resolves.toEqual(
      expect.objectContaining({
        signedOutAt: new Date('2026-06-20T06:12:00.000Z'),
      })
    );

    expect(authSession.signOut).toHaveBeenCalledTimes(1);
    expect(getActiveUserDataScope(realm)).toEqual(
      expect.objectContaining({
        scopeId: 'anonymous:device-1',
        scopeKind: UserDataScopeKind.Anonymous,
      })
    );
    expect(realm.objects(UserPlaylist).length).toBe(1);
  });

  it('still marks local session signed out when remote revoke fails', async () => {
    await controller.signIn({ username: 'ios_user', deviceId: 'device-1' });
    authSession.signOut.mockRejectedValueOnce(new Error('server unavailable'));

    await expect(
      controller.signOut({ signedOutAt: new Date('2026-06-20T06:12:00.000Z') })
    ).rejects.toThrow('server unavailable');

    expect(getActiveUserDataScope(realm)).toEqual(
      expect.objectContaining({
        scopeId: 'anonymous:device-1',
        scopeKind: UserDataScopeKind.Anonymous,
      })
    );
    expect(currentUserLibrarySessionMetadata(realm)).toBeNull();
  });

  it('cleans up token state when Realm metadata application fails after sign-in', async () => {
    authSession.signInDevelopmentSession.mockResolvedValueOnce(
      authResponse({
        user: {
          ...authResponse().user,
          scope_id: 'user:other-user',
        },
      })
    );

    await expect(controller.signIn({ username: 'ios_user' })).rejects.toThrow('scope_mismatch');

    expect(authSession.signOut).toHaveBeenCalledTimes(1);
    expect(getActiveUserDataScope(realm)).toBeNull();
    expect(realm.objects(UserAuthSessionMetadata).length).toBe(0);
  });

  it('signs out to anonymous scope even when Realm metadata is missing', async () => {
    setActiveUserDataScope(realm, {
      kind: UserDataScopeKind.Authenticated,
      userUuid: USER_UUID,
    });

    await expect(controller.signOut()).resolves.toBeNull();

    expect(authSession.signOut).toHaveBeenCalledTimes(1);
    expect(getActiveUserDataScope(realm)).toEqual(
      expect.objectContaining({
        scopeId: 'anonymous:local-device',
        scopeKind: UserDataScopeKind.Anonymous,
      })
    );
  });
});

function authResponse(
  overrides: Partial<UserLibraryAuthTokenResponse> = {}
): UserLibraryAuthTokenResponse {
  return {
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    access_token_expires_at: '2026-06-20T07:00:00.000Z',
    refresh_token_expires_at: '2027-06-20T06:00:00.000Z',
    user: {
      user_uuid: USER_UUID,
      username: 'ios_user',
      display_name: 'iOS User',
      scope_id: SCOPE_ID,
    },
    session: {
      session_uuid: 'session-1',
      device_id: 'device-1',
      device_name: 'iPhone Simulator',
      platform: 'ios',
      created_at: '2026-06-20T06:00:00.000Z',
      last_used_at: '2026-06-20T06:01:00.000Z',
    },
    ...overrides,
  };
}
