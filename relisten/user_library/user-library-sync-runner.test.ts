import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Realm from 'realm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RelistenUserLibraryApiClient,
  UserLibraryApiError,
} from '@/relisten/api/user_library_client';
import {
  ActiveUserDataScope,
  UserFavorite,
  UserPlaylist,
  UserPlaylistAccessRole,
  UserPlaylistEntry,
  UserPlaylistVisibility,
} from '@/relisten/realm/models/user_library';
import {
  PendingUserOperation,
  UserDataMigrationMarker,
  UserDataSyncStatus,
  UserSyncCursor,
} from '@/relisten/realm/models/user_library/sync';
import { setActiveUserDataScope } from '@/relisten/user_library/active_user_data_scope_service';
import { UserDataScopeKind } from '@/relisten/user_library/user_data_scope';
import {
  UserLibraryPendingPlaylistOperationRepository,
  UserLibraryPlaylistOperationRequest,
  UserLibraryPlaylistOperationResponse,
  UserLibraryPlaylistOperationType,
  pendingPlaylistOperationScopedId,
} from '@/relisten/user_library/playlist_operation_outbox';
import {
  UserLibrarySyncResponse,
  userLibrarySyncCursorScopedId,
} from '@/relisten/user_library/playlist_sync';
import {
  UserLibrarySyncRunner,
  UserLibrarySyncRunnerAuthSession,
} from '@/relisten/user_library/user_library_sync_runner';

const schema = [
  ActiveUserDataScope,
  UserPlaylist,
  UserPlaylistEntry,
  UserFavorite,
  PendingUserOperation,
  UserSyncCursor,
  UserDataMigrationMarker,
];

const SCOPE_ID = 'user:33333333-3333-4333-8333-333333333333';
const USER_1_UUID = '33333333-3333-4333-8333-333333333333';
const SCOPE_2_ID = 'user:44444444-4444-4444-8444-444444444444';
const USER_2_UUID = '44444444-4444-4444-8444-444444444444';
const PLAYLIST_UUID = '11111111-1111-4111-8111-111111111111';
const ENTRY_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TRACK_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OPERATION_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

class FakeAuthSession implements UserLibrarySyncRunnerAuthSession {
  private readonly session: { accessToken: string; scopeId: string } | undefined;

  constructor(session: { accessToken: string; scopeId: string } | null = defaultSession()) {
    this.session = session ?? undefined;
  }

  async withAuthenticatedSessionRetry<T>(
    request: (session: { accessToken: string; scopeId: string } | undefined) => Promise<T>
  ): Promise<T> {
    return request(this.session);
  }
}

class RefreshingAuthSession implements UserLibrarySyncRunnerAuthSession {
  async withAuthenticatedSessionRetry<T>(
    request: (session: { accessToken: string; scopeId: string } | undefined) => Promise<T>
  ): Promise<T> {
    try {
      return await request({ accessToken: 'expired-access', scopeId: SCOPE_ID });
    } catch (error) {
      if (error instanceof UserLibraryApiError && error.status === 401) {
        return request({ accessToken: 'fresh-access', scopeId: SCOPE_ID });
      }

      throw error;
    }
  }
}

class ScopeAwareFakeAuthSession implements UserLibrarySyncRunnerAuthSession {
  async withAuthenticatedSessionRetry<T>(
    request: (session: { accessToken: string; scopeId: string } | undefined) => Promise<T>,
    options?: { expectedScopeId?: string }
  ): Promise<T> {
    const scopeId = options?.expectedScopeId ?? SCOPE_ID;
    return request({
      accessToken: `access-for-${scopeId}`,
      scopeId,
    });
  }
}

function defaultSession() {
  return {
    accessToken: 'access-1',
    scopeId: SCOPE_ID,
  };
}

function playlistOperation(
  overrides: Partial<UserLibraryPlaylistOperationRequest> = {}
): UserLibraryPlaylistOperationRequest {
  return {
    op: UserLibraryPlaylistOperationType.AddTrack,
    idempotency_key: OPERATION_UUID,
    entry_uuid: ENTRY_UUID,
    source_track_uuid: TRACK_UUID,
    ...overrides,
  };
}

function operationResponse(
  overrides: Partial<UserLibraryPlaylistOperationResponse> = {}
): UserLibraryPlaylistOperationResponse {
  return {
    result_revision: 5,
    result_status: 'applied',
    playlist: {
      playlist_uuid: PLAYLIST_UUID,
      short_id: 'short-1',
      owner_user_uuid: USER_1_UUID,
      name: 'Server playlist',
      description: null,
      visibility: UserPlaylistVisibility.Private,
      current_revision: 5,
      entries: [
        {
          playlist_entry_uuid: ENTRY_UUID,
          source_track_uuid: TRACK_UUID,
          block_uuid: null,
          block_position: null,
          position: 'a0',
          added_by_user_uuid: USER_1_UUID,
        },
      ],
    },
    ...overrides,
  };
}

function syncResponse(overrides: Partial<UserLibrarySyncResponse> = {}): UserLibrarySyncResponse {
  return {
    changes: [
      {
        resource_type: 'playlist',
        updated_at: '2026-06-20T05:20:00.000Z',
        playlist_viewer_state: {
          is_owner: true,
          is_following: false,
          is_collaborator: false,
          can_edit: true,
          access_role: UserPlaylistAccessRole.Owner,
        },
        playlist: {
          ...operationResponse().playlist,
          current_revision: 6,
          name: 'Pulled playlist',
        },
      },
    ],
    tombstones: [],
    next_cursor: 'cursor-1',
    ...overrides,
  };
}

function setAuthenticatedScope(realm: Realm) {
  setActiveUserDataScope(realm, {
    kind: UserDataScopeKind.Authenticated,
    userUuid: USER_1_UUID,
  });
}

describe('UserLibrarySyncRunner', () => {
  let realm: Realm;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'relisten-sync-runner-'));
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

  it('skips server work while the active scope is signed out', async () => {
    setActiveUserDataScope(realm, {
      kind: UserDataScopeKind.Anonymous,
      deviceId: 'device-1',
    });
    const postJson = vi.fn(async () => operationResponse());
    const getJson = vi.fn(async () => syncResponse());
    const client = { postJson, getJson } as unknown as RelistenUserLibraryApiClient;
    const runner = new UserLibrarySyncRunner(realm, client, new FakeAuthSession());

    await expect(runner.runOnce('mount')).resolves.toEqual({
      status: 'skipped',
      reason: 'mount',
      scopeId: 'anonymous:device-1',
      skipReason: 'signed_out',
    });
    expect(postJson).not.toHaveBeenCalled();
    expect(getJson).not.toHaveBeenCalled();
  });

  it('replays pending playlist operations before pulling sync with the same access token', async () => {
    setAuthenticatedScope(realm);
    new UserLibraryPendingPlaylistOperationRepository(realm).enqueue(
      SCOPE_ID,
      PLAYLIST_UUID,
      playlistOperation()
    );
    const calls: string[] = [];
    const postJson = vi.fn(async () => {
      calls.push('post');
      return operationResponse();
    });
    const getJson = vi.fn(async () => {
      calls.push('get');
      return syncResponse();
    });
    const client = { postJson, getJson } as unknown as RelistenUserLibraryApiClient;
    const runner = new UserLibrarySyncRunner(
      realm,
      client,
      new FakeAuthSession({ accessToken: 'access-1', scopeId: SCOPE_ID })
    );

    await expect(runner.runOnce('network')).resolves.toEqual(
      expect.objectContaining({
        status: 'completed',
        reason: 'network',
        scopeId: SCOPE_ID,
        cursorBefore: undefined,
        cursorAfter: 'cursor-1',
      })
    );

    expect(calls).toEqual(['post', 'get']);
    expect(postJson).toHaveBeenCalledWith(
      `/playlists/${PLAYLIST_UUID}/operations`,
      playlistOperation(),
      { accessToken: 'access-1' }
    );
    expect(getJson).toHaveBeenCalledWith('/sync', { accessToken: 'access-1' });
    expect(
      realm.objectForPrimaryKey(
        PendingUserOperation,
        pendingPlaylistOperationScopedId(SCOPE_ID, OPERATION_UUID)
      )
    ).toEqual(expect.objectContaining({ syncStatus: UserDataSyncStatus.Synced }));
  });

  it('uses the auth session retry path when pull sync rejects an expired access token', async () => {
    setAuthenticatedScope(realm);
    const getJson = vi
      .fn()
      .mockRejectedValueOnce(new UserLibraryApiError(401, 'GET', '/api/v3/library/sync', 'expired'))
      .mockResolvedValueOnce(syncResponse());
    const client = {
      postJson: vi.fn(),
      getJson,
    } as unknown as RelistenUserLibraryApiClient;
    const runner = new UserLibrarySyncRunner(realm, client, new RefreshingAuthSession());

    await expect(runner.runOnce('foreground')).resolves.toEqual(
      expect.objectContaining({
        status: 'completed',
        cursorAfter: 'cursor-1',
      })
    );

    expect(getJson).toHaveBeenNthCalledWith(1, '/sync', { accessToken: 'expired-access' });
    expect(getJson).toHaveBeenNthCalledWith(2, '/sync', { accessToken: 'fresh-access' });
  });

  it('skips server work when an authenticated scope has no stored session token', async () => {
    setAuthenticatedScope(realm);
    const postJson = vi.fn(async () => operationResponse());
    const getJson = vi.fn(async () => syncResponse());
    const client = { postJson, getJson } as unknown as RelistenUserLibraryApiClient;
    const runner = new UserLibrarySyncRunner(realm, client, new FakeAuthSession(null));

    await expect(runner.runOnce('mount')).resolves.toEqual({
      status: 'skipped',
      reason: 'mount',
      scopeId: SCOPE_ID,
      skipReason: 'missing_auth_session',
    });
    expect(postJson).not.toHaveBeenCalled();
    expect(getJson).not.toHaveBeenCalled();
  });

  it('skips server work when the authenticated session belongs to a different scope', async () => {
    setActiveUserDataScope(realm, {
      kind: UserDataScopeKind.Authenticated,
      userUuid: USER_2_UUID,
    });
    const postJson = vi.fn(async () => operationResponse());
    const getJson = vi.fn(async () => syncResponse());
    const client = { postJson, getJson } as unknown as RelistenUserLibraryApiClient;
    const runner = new UserLibrarySyncRunner(
      realm,
      client,
      new FakeAuthSession({ accessToken: 'access-user-1', scopeId: SCOPE_ID })
    );

    await expect(runner.runOnce('scope-change')).resolves.toEqual({
      status: 'skipped',
      reason: 'scope-change',
      scopeId: SCOPE_2_ID,
      skipReason: 'session_scope_mismatch',
    });
    expect(postJson).not.toHaveBeenCalled();
    expect(getJson).not.toHaveBeenCalled();
  });

  it('retries pending operation replay after an expired access token', async () => {
    setAuthenticatedScope(realm);
    new UserLibraryPendingPlaylistOperationRepository(realm).enqueue(
      SCOPE_ID,
      PLAYLIST_UUID,
      playlistOperation()
    );
    const postJson = vi
      .fn()
      .mockRejectedValueOnce(
        new UserLibraryApiError(
          401,
          'POST',
          `/api/v3/library/playlists/${PLAYLIST_UUID}/operations`,
          'expired'
        )
      )
      .mockResolvedValueOnce(operationResponse());
    const getJson = vi.fn(async () => syncResponse());
    const client = {
      postJson,
      getJson,
    } as unknown as RelistenUserLibraryApiClient;
    const runner = new UserLibrarySyncRunner(realm, client, new RefreshingAuthSession());

    await expect(runner.runOnce('foreground')).resolves.toEqual(
      expect.objectContaining({
        status: 'completed',
        cursorAfter: 'cursor-1',
      })
    );

    expect(postJson).toHaveBeenNthCalledWith(
      1,
      `/playlists/${PLAYLIST_UUID}/operations`,
      playlistOperation(),
      { accessToken: 'expired-access' }
    );
    expect(postJson).toHaveBeenNthCalledWith(
      2,
      `/playlists/${PLAYLIST_UUID}/operations`,
      playlistOperation(),
      { accessToken: 'fresh-access' }
    );
    expect(getJson).toHaveBeenCalledWith('/sync', { accessToken: 'fresh-access' });
    expect(
      realm.objectForPrimaryKey(
        PendingUserOperation,
        pendingPlaylistOperationScopedId(SCOPE_ID, OPERATION_UUID)
      )
    ).toEqual(expect.objectContaining({ attemptCount: 2, syncStatus: UserDataSyncStatus.Synced }));
  });

  it('coalesces overlapping runs for the same runner instance', async () => {
    setAuthenticatedScope(realm);
    let resolvePull: (response: UserLibrarySyncResponse) => void;
    const pull = new Promise<UserLibrarySyncResponse>((resolve) => {
      resolvePull = resolve;
    });
    const getJson = vi.fn(() => pull);
    const client = {
      postJson: vi.fn(),
      getJson,
    } as unknown as RelistenUserLibraryApiClient;
    const runner = new UserLibrarySyncRunner(realm, client, new ScopeAwareFakeAuthSession());

    const first = runner.runOnce('mount');
    await vi.waitFor(() => expect(getJson).toHaveBeenCalledTimes(1));

    await expect(runner.runOnce('foreground')).resolves.toEqual({
      status: 'already_running',
      reason: 'foreground',
    });

    resolvePull!(syncResponse({ next_cursor: 'cursor-2' }));
    await expect(first).resolves.toEqual(
      expect.objectContaining({
        status: 'completed',
        cursorAfter: 'cursor-2',
      })
    );
    expect(
      realm.objectForPrimaryKey(UserSyncCursor, userLibrarySyncCursorScopedId(SCOPE_ID))
    ).toEqual(expect.objectContaining({ cursor: 'cursor-2' }));
  });

  it('does not apply pull results after the active scope signs out mid-run', async () => {
    setAuthenticatedScope(realm);
    let resolvePull: (response: UserLibrarySyncResponse) => void;
    const pull = new Promise<UserLibrarySyncResponse>((resolve) => {
      resolvePull = resolve;
    });
    const getJson = vi.fn(() => pull);
    const client = {
      postJson: vi.fn(),
      getJson,
    } as unknown as RelistenUserLibraryApiClient;
    const runner = new UserLibrarySyncRunner(realm, client, new FakeAuthSession());

    const run = runner.runOnce('mount');
    await vi.waitFor(() => expect(getJson).toHaveBeenCalledTimes(1));

    setActiveUserDataScope(realm, {
      kind: UserDataScopeKind.Anonymous,
      deviceId: 'device-1',
    });
    resolvePull!(syncResponse({ next_cursor: 'stale-cursor' }));

    await expect(run).resolves.toEqual({
      status: 'skipped',
      reason: 'mount',
      scopeId: SCOPE_ID,
      skipReason: 'stale_scope',
    });
    expect(realm.objectForPrimaryKey(UserSyncCursor, userLibrarySyncCursorScopedId(SCOPE_ID))).toBe(
      null
    );
    expect(realm.objects(UserPlaylist).length).toBe(0);
  });

  it('runs a queued scope-change sync after the current run finishes', async () => {
    setAuthenticatedScope(realm);
    let resolveFirstPull: (response: UserLibrarySyncResponse) => void;
    const firstPull = new Promise<UserLibrarySyncResponse>((resolve) => {
      resolveFirstPull = resolve;
    });
    const getJson = vi
      .fn()
      .mockImplementationOnce(() => firstPull)
      .mockResolvedValueOnce(syncResponse({ next_cursor: 'cursor-user-2' }));
    const client = {
      postJson: vi.fn(),
      getJson,
    } as unknown as RelistenUserLibraryApiClient;
    const runner = new UserLibrarySyncRunner(realm, client, new ScopeAwareFakeAuthSession());

    const first = runner.runOnce('mount');
    await vi.waitFor(() => expect(getJson).toHaveBeenCalledTimes(1));

    setActiveUserDataScope(realm, {
      kind: UserDataScopeKind.Authenticated,
      userUuid: USER_2_UUID,
    });
    await expect(runner.runOnce('scope-change')).resolves.toEqual({
      status: 'already_running',
      reason: 'scope-change',
    });

    resolveFirstPull!(syncResponse({ next_cursor: 'cursor-user-1' }));
    await expect(first).resolves.toEqual({
      status: 'skipped',
      reason: 'mount',
      scopeId: SCOPE_ID,
      skipReason: 'stale_scope',
    });
    await vi.waitFor(() => expect(getJson).toHaveBeenCalledTimes(2));

    await vi.waitFor(() =>
      expect(
        realm.objectForPrimaryKey(UserSyncCursor, userLibrarySyncCursorScopedId(SCOPE_2_ID))
      ).toEqual(expect.objectContaining({ cursor: 'cursor-user-2' }))
    );
    expect(realm.objectForPrimaryKey(UserSyncCursor, userLibrarySyncCursorScopedId(SCOPE_ID))).toBe(
      null
    );
  });
});
