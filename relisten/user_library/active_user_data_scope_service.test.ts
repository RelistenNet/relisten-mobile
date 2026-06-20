import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Realm from 'realm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ActiveUserDataScope,
  UserPlaylist,
  UserPlaylistVisibility,
} from '@/relisten/realm/models/user_library';
import {
  ensureAnonymousUserDataScope,
  getActiveUserDataScope,
  scopedRealmObjectForPrimaryKey,
  scopedRealmObjects,
  setActiveUserDataScope,
} from '@/relisten/user_library/active_user_data_scope_service';
import {
  scopedUserDataPrimaryKey,
  UserDataScopeKind,
} from '@/relisten/user_library/user_data_scope';

const schema = [ActiveUserDataScope, UserPlaylist];

describe('active user data scope service', () => {
  let realm: Realm;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'relisten-scope-'));
    realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema,
      schemaVersion: 1,
    });
  });

  afterEach(() => {
    realm.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates an anonymous scope once and then switches to an authenticated scope', () => {
    expect(getActiveUserDataScope(realm)).toBeNull();

    const anonymousScope = ensureAnonymousUserDataScope(realm, 'device-a');
    expect(anonymousScope.scopeId).toBe('anonymous:device-a');
    expect(anonymousScope.scopeKind).toBe(UserDataScopeKind.Anonymous);
    expect(anonymousScope.deviceId).toBe('device-a');

    const unchangedScope = ensureAnonymousUserDataScope(realm, 'device-b');
    expect(unchangedScope.scopeId).toBe('anonymous:device-a');

    const activatedAt = new Date('2026-06-20T00:00:00Z');
    const authenticatedScope = setActiveUserDataScope(
      realm,
      {
        kind: UserDataScopeKind.Authenticated,
        userUuid: 'user-1',
      },
      {
        activatedAt,
        displayName: 'A User',
      }
    );

    expect(authenticatedScope.scopeId).toBe('user:user-1');
    expect(authenticatedScope.scopeKind).toBe(UserDataScopeKind.Authenticated);
    expect(authenticatedScope.userUuid).toBe('user-1');
    expect(authenticatedScope.deviceId).toBeNull();
    expect(authenticatedScope.displayName).toBe('A User');
    expect(authenticatedScope.lastActivatedAt).toEqual(activatedAt);
    expect(realm.objects(ActiveUserDataScope).length).toBe(1);
  });

  it('scopes Realm queries and primary-key lookup by scopeId', () => {
    const scopeA = 'user:user-a';
    const scopeB = 'user:user-b';
    const now = new Date('2026-06-20T00:00:00Z');

    realm.write(() => {
      realm.create(UserPlaylist, {
        scopedId: scopedUserDataPrimaryKey(scopeA, 'playlist-1'),
        scopeId: scopeA,
        uuid: 'playlist-1',
        name: 'Scope A playlist',
        visibility: UserPlaylistVisibility.Private,
        currentRevision: 1,
        createdAt: now,
        updatedAt: now,
      });
      realm.create(UserPlaylist, {
        scopedId: scopedUserDataPrimaryKey(scopeB, 'playlist-1'),
        scopeId: scopeB,
        uuid: 'playlist-1',
        name: 'Scope B playlist',
        visibility: UserPlaylistVisibility.Private,
        currentRevision: 1,
        createdAt: now,
        updatedAt: now,
      });
    });

    const scopeAPlaylists = [
      ...scopedRealmObjects(realm, UserPlaylist.schema.name, scopeA),
    ] as unknown as UserPlaylist[];

    expect(scopeAPlaylists).toEqual([expect.objectContaining({ name: 'Scope A playlist' })]);
    expect(
      scopedRealmObjectForPrimaryKey(
        realm,
        UserPlaylist.schema.name,
        scopeB,
        'playlist-1'
      ) as UserPlaylist | null
    ).toEqual(expect.objectContaining({ name: 'Scope B playlist' }));
  });
});
