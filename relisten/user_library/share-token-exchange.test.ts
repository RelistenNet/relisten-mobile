import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Realm from 'realm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserAuthSessionMetadata } from '@/relisten/realm/models/user_library/auth';
import { ActiveUserDataScope } from '@/relisten/realm/models/user_library/scope';
import {
  UserMobileAccessGrant,
  UserPlaylistAccessRole,
  UserPlaylistVisibility,
} from '@/relisten/realm/models/user_library/playlists';
import { RelistenUserLibraryApiClient } from '@/relisten/api/user_library_client';
import {
  buildMobileAccessGrantHeaders,
  exchangeOpenedPlaylistShareToken,
  exchangePlaylistShareToken,
  MOBILE_ACCESS_GRANT_DEVICE_ID_HEADER_NAME,
  MOBILE_ACCESS_GRANT_HEADER_NAME,
  MOBILE_ACCESS_GRANT_TYPE_SHARE_TOKEN,
  MobileAccessGrantSecretStore,
  mobileAccessGrantMetadata,
  mobileAccessGrantScopedId,
  mobileAccessGrantSecretStorageKey,
  parseMobileAccessGrantToken,
  persistMobileAccessGrantFromExchange,
  PlaylistShareTokenExchangeError,
  PlaylistShareTokenExchangeResponse,
} from '@/relisten/user_library/share_token_exchange';
import { setActiveUserDataScope } from '@/relisten/user_library/active_user_data_scope_service';
import {
  authenticatedUserDataScopeId,
  scopedUserDataPrimaryKey,
  UserDataScopeKind,
} from '@/relisten/user_library/user_data_scope';

const BASE_URL = 'http://localhost:5119';
const SCOPE_ID = 'anonymous:device-1';
const DEVICE_ID = 'device-1';

class FakeMobileAccessGrantSecretStore implements MobileAccessGrantSecretStore {
  readonly secrets = new Map<string, string>();

  async getGrantSecret(storageKey: string): Promise<string | null> {
    return this.secrets.get(storageKey) ?? null;
  }

  async setGrantSecret(storageKey: string, secret: string): Promise<void> {
    this.secrets.set(storageKey, secret);
  }

  async clearGrantSecret(storageKey: string): Promise<void> {
    this.secrets.delete(storageKey);
  }
}

function exchangeResponse(
  overrides: Partial<PlaylistShareTokenExchangeResponse> = {}
): PlaylistShareTokenExchangeResponse {
  return {
    playlist_uuid: 'playlist-1',
    short_id: 'abc123',
    role: UserPlaylistAccessRole.Viewer,
    mobile_access_grant: {
      token: 'selector-1.secret-1',
      expires_at: '2026-06-20T08:00:00.000Z',
      header_name: MOBILE_ACCESS_GRANT_HEADER_NAME,
    },
    ...overrides,
  };
}

describe('exchangePlaylistShareToken', () => {
  it('posts the transient URL token to the mobile exchange endpoint', async () => {
    const fetchFn = vi.fn(async () => {
      return Response.json(exchangeResponse());
    });
    const client = new RelistenUserLibraryApiClient({
      baseUrl: BASE_URL,
      fetchFn: fetchFn as typeof fetch,
    });

    await expect(
      exchangePlaylistShareToken(
        client,
        'abc 123',
        {
          token: 'url-share-token',
          device_id: DEVICE_ID,
          platform: 'ios',
        },
        { accessToken: 'access-1' }
      )
    ).resolves.toEqual(exchangeResponse());

    const [[url, request]] = fetchFn.mock.calls as unknown as [string, RequestInit][];
    const headers = request.headers as Headers;
    expect(url).toBe(`${BASE_URL}/api/v3/library/playlists/abc%20123/share-tokens/exchange`);
    expect(request.method).toBe('POST');
    expect(request.body).toBe(
      JSON.stringify({
        token: 'url-share-token',
        device_id: DEVICE_ID,
        platform: 'ios',
      })
    );
    expect(headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('rejects malformed exchange inputs before creating the request', async () => {
    const client = {
      postJson: vi.fn(),
    } as unknown as RelistenUserLibraryApiClient;

    expect(() =>
      exchangePlaylistShareToken(client, '', {
        token: 'url-share-token',
        device_id: DEVICE_ID,
        platform: 'ios',
      })
    ).toThrow(new PlaylistShareTokenExchangeError('playlist_uuid_or_short_id_required'));
    expect(() =>
      exchangePlaylistShareToken(client, 'abc123', {
        token: '   ',
        device_id: DEVICE_ID,
        platform: 'ios',
      })
    ).toThrow(new PlaylistShareTokenExchangeError('token_required'));
    expect(() =>
      exchangePlaylistShareToken(client, 'abc123', {
        token: 'url-share-token',
        device_id: '',
        platform: 'ios',
      })
    ).toThrow(new PlaylistShareTokenExchangeError('device_id_required'));
    expect(() =>
      exchangePlaylistShareToken(client, 'abc123', {
        token: 'url-share-token',
        device_id: DEVICE_ID,
        platform: 'desktop' as 'ios',
      })
    ).toThrow(new PlaylistShareTokenExchangeError('unsupported_platform'));
    expect(client.postJson).not.toHaveBeenCalled();
  });
});

describe('mobile access grant token parsing', () => {
  it('splits selector and secret while allowing dots inside the secret', () => {
    expect(parseMobileAccessGrantToken('selector.secret.with.dot')).toEqual({
      selector: 'selector',
      secret: 'secret.with.dot',
    });
  });

  it('rejects malformed grant tokens', () => {
    expect(() => parseMobileAccessGrantToken('selector-only')).toThrow(
      new PlaylistShareTokenExchangeError('invalid_mobile_access_grant_token')
    );
    expect(() => parseMobileAccessGrantToken('.secret')).toThrow(
      new PlaylistShareTokenExchangeError('invalid_mobile_access_grant_token')
    );
    expect(() => parseMobileAccessGrantToken('selector.')).toThrow(
      new PlaylistShareTokenExchangeError('invalid_mobile_access_grant_token')
    );
  });

  it('generates keys that satisfy Expo SecureStore validation', () => {
    const key = mobileAccessGrantSecretStorageKey(
      'anonymous:device-1',
      "selector:/with%reserved!~*'()"
    );

    expect(key).toMatch(/^[\w.-]+$/);
    expect(key).not.toContain(':');
    expect(key).not.toContain('%');
  });

  it('uses stable UTF-8 base64url storage key parts', () => {
    expect(mobileAccessGrantSecretStorageKey('user:alec@example.com', 'séléctor')).toBe(
      'relisten_user_library_mobile_access_grant_v1.dXNlcjphbGVjQGV4YW1wbGUuY29t.c8OpbMOpY3Rvcg'
    );
  });
});

describe('exchangeOpenedPlaylistShareToken', () => {
  let realm: Realm;
  let tempDir: string;
  let secretStore: FakeMobileAccessGrantSecretStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'relisten-open-share-token-'));
    realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema: [ActiveUserDataScope, UserAuthSessionMetadata, UserMobileAccessGrant],
      schemaVersion: 1,
    });
    secretStore = new FakeMobileAccessGrantSecretStore();
  });

  afterEach(() => {
    realm.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('exchanges opened links in the active anonymous device scope', async () => {
    setActiveUserDataScope(realm, {
      kind: UserDataScopeKind.Anonymous,
      deviceId: 'opened-device',
    });
    const postJson = vi.fn(async () => exchangeResponse());
    const client = { postJson } as unknown as RelistenUserLibraryApiClient;

    const result = await exchangeOpenedPlaylistShareToken(
      {
        playlistUuidOrShortId: 'abc123',
        token: 'url-share-token',
      },
      {
        realm,
        client,
        secretStore,
        platform: 'ios',
        now: new Date('2026-06-20T07:00:00.000Z'),
      }
    );

    expect(result).toEqual(
      expect.objectContaining({
        scopeId: 'anonymous:opened-device',
        deviceId: 'opened-device',
      })
    );
    expect(postJson).toHaveBeenCalledWith(
      '/playlists/abc123/share-tokens/exchange',
      {
        token: 'url-share-token',
        device_id: 'opened-device',
        platform: 'ios',
      },
      undefined
    );
    expect(result.grant?.metadataJson).not.toContain('url-share-token');
  });

  it('uses authenticated retry and the active session device for signed-in scopes', async () => {
    const scopeId = authenticatedUserDataScopeId('user-1');
    setActiveUserDataScope(realm, {
      kind: UserDataScopeKind.Authenticated,
      userUuid: 'user-1',
    });
    realm.write(() => {
      realm.create(UserAuthSessionMetadata, {
        scopedId: scopedUserDataPrimaryKey(scopeId, 'session:session-1'),
        scopeId,
        userUuid: 'user-1',
        sessionUuid: 'session-1',
        deviceId: 'signed-in-device',
        lastAuthenticatedAt: new Date('2026-06-20T06:00:00.000Z'),
      });
    });

    const postJson = vi.fn(async () => exchangeResponse());
    const client = { postJson } as unknown as RelistenUserLibraryApiClient;
    const authSession = {
      withAuthenticatedSessionRetry: vi.fn(async (request, options) => {
        expect(options).toEqual({ expectedScopeId: scopeId });
        return request({ accessToken: 'access-1', scopeId });
      }),
    };

    await exchangeOpenedPlaylistShareToken(
      {
        playlistUuidOrShortId: 'abc123',
        token: 'url-share-token',
      },
      {
        realm,
        client,
        secretStore,
        platform: 'ios',
        authSession,
      }
    );

    expect(postJson).toHaveBeenCalledWith(
      '/playlists/abc123/share-tokens/exchange',
      {
        token: 'url-share-token',
        device_id: 'signed-in-device',
        platform: 'ios',
      },
      { accessToken: 'access-1' }
    );
  });

  it('rejects an exchange response if the active scope changes while the request is in flight', async () => {
    setActiveUserDataScope(realm, {
      kind: UserDataScopeKind.Anonymous,
      deviceId: 'opened-device',
    });
    let resolveExchange!: (response: PlaylistShareTokenExchangeResponse) => void;
    const postJson = vi.fn(
      () =>
        new Promise<PlaylistShareTokenExchangeResponse>((resolve) => {
          resolveExchange = resolve;
        })
    );
    const client = { postJson } as unknown as RelistenUserLibraryApiClient;

    const exchange = exchangeOpenedPlaylistShareToken(
      {
        playlistUuidOrShortId: 'abc123',
        token: 'url-share-token',
      },
      {
        realm,
        client,
        secretStore,
        platform: 'ios',
      }
    );

    expect(postJson).toHaveBeenCalled();

    setActiveUserDataScope(realm, {
      kind: UserDataScopeKind.Anonymous,
      deviceId: 'other-device',
    });
    resolveExchange(exchangeResponse());

    await expect(exchange).rejects.toThrow(new PlaylistShareTokenExchangeError('scope_changed'));
    expect(secretStore.secrets.size).toBe(0);
    expect(realm.objects(UserMobileAccessGrant).length).toBe(0);
  });
});

describe('persistMobileAccessGrantFromExchange', () => {
  let realm: Realm;
  let tempDir: string;
  let secretStore: FakeMobileAccessGrantSecretStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'relisten-share-token-exchange-'));
    realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema: [UserMobileAccessGrant],
      schemaVersion: 1,
    });
    secretStore = new FakeMobileAccessGrantSecretStore();
  });

  afterEach(() => {
    realm.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('stores grant secret separately from scoped Realm metadata', async () => {
    const grant = await persistMobileAccessGrantFromExchange(realm, secretStore, {
      scopeId: SCOPE_ID,
      deviceId: DEVICE_ID,
      platform: 'ios',
      response: exchangeResponse(),
      receivedAt: new Date('2026-06-20T07:00:00.000Z'),
    });

    const storageKey = mobileAccessGrantSecretStorageKey(SCOPE_ID, 'selector-1');
    const storedGrant = realm.objectForPrimaryKey(
      UserMobileAccessGrant,
      mobileAccessGrantScopedId(SCOPE_ID, 'selector-1')
    );
    const metadata = mobileAccessGrantMetadata(storedGrant!);

    expect(grant).toEqual(expect.objectContaining({ scopedId: storedGrant?.scopedId }));
    expect(await secretStore.getGrantSecret(storageKey)).toBe('secret-1');
    expect(storedGrant).toEqual(
      expect.objectContaining({
        scopeId: SCOPE_ID,
        uuid: 'selector-1',
        playlistUuid: 'playlist-1',
        role: UserPlaylistAccessRole.Viewer,
        grantType: MOBILE_ACCESS_GRANT_TYPE_SHARE_TOKEN,
        createdAt: new Date('2026-06-20T07:00:00.000Z'),
        updatedAt: new Date('2026-06-20T07:00:00.000Z'),
        expiresAt: new Date('2026-06-20T08:00:00.000Z'),
        revokedAt: null,
      })
    );
    expect(metadata).toEqual({
      tokenSelector: 'selector-1',
      deviceId: DEVICE_ID,
      platform: 'ios',
      headerName: MOBILE_ACCESS_GRANT_HEADER_NAME,
      playlistShortId: 'abc123',
      receivedAt: '2026-06-20T07:00:00.000Z',
    });
    expect(storedGrant?.metadataJson).not.toContain('secret-1');
    expect(storedGrant?.metadataJson).not.toContain('url-share-token');
  });

  it('uses playlist snapshots when the minimal top-level fields are absent', async () => {
    await persistMobileAccessGrantFromExchange(realm, secretStore, {
      scopeId: SCOPE_ID,
      deviceId: DEVICE_ID,
      platform: 'ios',
      response: exchangeResponse({
        playlist_uuid: undefined,
        short_id: undefined,
        role: undefined,
        playlist_viewer_state: {
          is_owner: false,
          is_following: false,
          is_collaborator: false,
          can_edit: false,
          access_role: UserPlaylistAccessRole.Viewer,
        },
        playlist: {
          playlist_uuid: 'playlist-from-snapshot',
          short_id: 'snap123',
          owner_user_uuid: 'owner-1',
          name: 'Shared playlist',
          description: null,
          visibility: UserPlaylistVisibility.Unlisted,
          current_revision: 3,
          entries: [],
        },
      }),
    });

    const storedGrant = realm.objectForPrimaryKey(
      UserMobileAccessGrant,
      mobileAccessGrantScopedId(SCOPE_ID, 'selector-1')
    );

    expect(storedGrant).toEqual(
      expect.objectContaining({
        playlistUuid: 'playlist-from-snapshot',
        role: UserPlaylistAccessRole.Viewer,
      })
    );
    expect(mobileAccessGrantMetadata(storedGrant!).playlistShortId).toBe('snap123');
  });

  it('does not persist anything when the exchange response has no mobile grant', async () => {
    await expect(
      persistMobileAccessGrantFromExchange(realm, secretStore, {
        scopeId: SCOPE_ID,
        deviceId: DEVICE_ID,
        platform: 'ios',
        response: exchangeResponse({ mobile_access_grant: null, requires_sign_in: true }),
      })
    ).resolves.toBeNull();

    expect(secretStore.secrets.size).toBe(0);
    expect(realm.objects(UserMobileAccessGrant).length).toBe(0);
  });
});

describe('buildMobileAccessGrantHeaders', () => {
  let realm: Realm;
  let tempDir: string;
  let secretStore: FakeMobileAccessGrantSecretStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'relisten-share-token-headers-'));
    realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema: [UserMobileAccessGrant],
      schemaVersion: 1,
    });
    secretStore = new FakeMobileAccessGrantSecretStore();
  });

  afterEach(() => {
    realm.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('builds tokenless playlist-read headers from metadata and secure storage', async () => {
    const grant = await persistMobileAccessGrantFromExchange(realm, secretStore, {
      scopeId: SCOPE_ID,
      deviceId: DEVICE_ID,
      platform: 'ios',
      response: exchangeResponse(),
      receivedAt: new Date('2026-06-20T07:00:00.000Z'),
    });

    await expect(
      buildMobileAccessGrantHeaders(secretStore, grant!, {
        now: new Date('2026-06-20T07:30:00.000Z'),
      })
    ).resolves.toEqual({
      [MOBILE_ACCESS_GRANT_HEADER_NAME]: 'selector-1.secret-1',
      [MOBILE_ACCESS_GRANT_DEVICE_ID_HEADER_NAME]: DEVICE_ID,
    });
  });

  it('skips expired, revoked, or secretless grants', async () => {
    const grant = await persistMobileAccessGrantFromExchange(realm, secretStore, {
      scopeId: SCOPE_ID,
      deviceId: DEVICE_ID,
      platform: 'ios',
      response: exchangeResponse(),
      receivedAt: new Date('2026-06-20T07:00:00.000Z'),
    });

    await expect(
      buildMobileAccessGrantHeaders(secretStore, grant!, {
        now: new Date('2026-06-20T08:00:00.001Z'),
      })
    ).resolves.toBeUndefined();

    realm.write(() => {
      grant!.revokedAt = new Date('2026-06-20T07:45:00.000Z');
    });
    await expect(
      buildMobileAccessGrantHeaders(secretStore, grant!, {
        now: new Date('2026-06-20T07:50:00.000Z'),
      })
    ).resolves.toBeUndefined();

    realm.write(() => {
      grant!.revokedAt = undefined;
    });
    await secretStore.clearGrantSecret(mobileAccessGrantSecretStorageKey(SCOPE_ID, 'selector-1'));

    await expect(
      buildMobileAccessGrantHeaders(secretStore, grant!, {
        now: new Date('2026-06-20T07:50:00.000Z'),
      })
    ).resolves.toBeUndefined();
  });
});
