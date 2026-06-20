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
  UserPlaylist,
  UserPlaylistAccessRole,
  UserPlaylistEntry,
  UserPlaylistVisibility,
} from '@/relisten/realm/models/user_library/playlists';
import {
  PendingUserOperation,
  UserDataSyncStatus,
} from '@/relisten/realm/models/user_library/sync';
import {
  pendingPlaylistOperationScopedId,
  postUserLibraryPlaylistOperation,
  UserLibraryPendingPlaylistOperationRepository,
  UserLibraryPlaylistOperationOutboxError,
  UserLibraryPlaylistOperationReplayService,
  UserLibraryPlaylistOperationRequest,
  UserLibraryPlaylistOperationResponse,
  UserLibraryPlaylistOperationType,
} from '@/relisten/user_library/playlist_operation_outbox';
import { scopedUserDataPrimaryKey } from '@/relisten/user_library/user_data_scope';

const schema = [UserPlaylist, UserPlaylistEntry, PendingUserOperation];
const SCOPE_ID = 'user:user-1';
const PLAYLIST_1_UUID = '11111111-1111-4111-8111-111111111111';
const PLAYLIST_2_UUID = '22222222-2222-4222-8222-222222222222';
const USER_1_UUID = '33333333-3333-4333-8333-333333333333';
const OPERATION_1_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPERATION_2_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const OPERATION_3_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac';
const ENTRY_1_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ENTRY_2_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc';
const OLD_ENTRY_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbd';
const TRACK_1_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TRACK_2_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccd';
const ANCHOR_ENTRY_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function playlistOperation(
  overrides: Partial<UserLibraryPlaylistOperationRequest> = {}
): UserLibraryPlaylistOperationRequest {
  return {
    op: UserLibraryPlaylistOperationType.AddTrack,
    idempotency_key: OPERATION_1_UUID,
    base_revision: 4,
    entry_uuid: ENTRY_1_UUID,
    source_track_uuid: TRACK_1_UUID,
    placement: {
      after_entry_uuid: ANCHOR_ENTRY_UUID,
      position_hint: 'aM',
    },
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
      playlist_uuid: PLAYLIST_1_UUID,
      short_id: 'short-1',
      owner_user_uuid: USER_1_UUID,
      name: 'Server playlist',
      description: null,
      visibility: UserPlaylistVisibility.Private,
      current_revision: 5,
      entries: [
        {
          playlist_entry_uuid: ENTRY_1_UUID,
          source_track_uuid: TRACK_1_UUID,
          block_uuid: null,
          block_position: null,
          position: 'a',
          added_by_user_uuid: USER_1_UUID,
        },
      ],
    },
    ...overrides,
  };
}

describe('postUserLibraryPlaylistOperation', () => {
  it('posts playlist operations to the server operation route', async () => {
    const response = operationResponse();
    const postJson = vi.fn(async () => response);
    const client = { postJson } as unknown as RelistenUserLibraryApiClient;
    const operation = playlistOperation();

    await expect(
      postUserLibraryPlaylistOperation(client, PLAYLIST_1_UUID, operation)
    ).resolves.toBe(response);

    expect(postJson).toHaveBeenCalledWith(`/playlists/${PLAYLIST_1_UUID}/operations`, operation);
  });

  it('serializes the operation body through the user-library API client', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return new Response(JSON.stringify(operationResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const client = new RelistenUserLibraryApiClient({
      baseUrl: 'http://127.0.0.1:5119',
      fetchFn,
      accessTokenProvider: async () => 'access-1',
    });
    const operation = playlistOperation();

    await postUserLibraryPlaylistOperation(client, PLAYLIST_1_UUID, operation);

    expect(requests[0]).toEqual(
      expect.objectContaining({
        input: `http://127.0.0.1:5119/api/v3/library/playlists/${PLAYLIST_1_UUID}/operations`,
        init: expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(operation),
        }),
      })
    );
    const headers = requests[0].init!.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer access-1');
    expect(headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('UserLibraryPendingPlaylistOperationRepository', () => {
  let realm: Realm;
  let repository: UserLibraryPendingPlaylistOperationRepository;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'relisten-playlist-outbox-'));
    realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema,
      schemaVersion: 1,
    });
    repository = new UserLibraryPendingPlaylistOperationRepository(realm);
  });

  afterEach(() => {
    realm.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('stores stable idempotent pending playlist operations by scope', () => {
    const createdAt = new Date('2026-06-20T04:55:00.000Z');
    const operation = playlistOperation({
      placement: {
        position_hint: 'aM',
        after_entry_uuid: ANCHOR_ENTRY_UUID,
      },
    });

    const first = repository.enqueue(SCOPE_ID, PLAYLIST_1_UUID, operation, {
      now: createdAt,
    });
    const second = repository.enqueue(SCOPE_ID, PLAYLIST_1_UUID, operation, {
      now: new Date('2026-06-20T04:56:00.000Z'),
    });

    expect(second.scopedId).toBe(first.scopedId);
    expect(first).toEqual(
      expect.objectContaining({
        scopedId: pendingPlaylistOperationScopedId(SCOPE_ID, OPERATION_1_UUID),
        scopeId: SCOPE_ID,
        uuid: OPERATION_1_UUID,
        operationType: UserLibraryPlaylistOperationType.AddTrack,
        entityType: 'playlist',
        entityUuid: PLAYLIST_1_UUID,
        baseRevision: 4,
        syncStatus: UserDataSyncStatus.Pending,
        attemptCount: 0,
        createdAt,
        updatedAt: createdAt,
      })
    );
    expect(realm.objects(PendingUserOperation).length).toBe(1);

    expect(() =>
      repository.enqueue(
        SCOPE_ID,
        PLAYLIST_1_UUID,
        playlistOperation({ source_track_uuid: TRACK_2_UUID })
      )
    ).toThrowError(new UserLibraryPlaylistOperationOutboxError('idempotency_key_conflict'));
  });

  it('rejects non-GUID playlist operation identifiers before persistence', () => {
    expect(() =>
      repository.enqueue(SCOPE_ID, PLAYLIST_1_UUID, playlistOperation({ idempotency_key: 'op-1' }))
    ).toThrowError(new UserLibraryPlaylistOperationOutboxError('invalid_idempotency_key'));

    expect(() =>
      repository.enqueue(SCOPE_ID, PLAYLIST_1_UUID, playlistOperation({ entry_uuid: 'entry-1' }))
    ).toThrowError(new UserLibraryPlaylistOperationOutboxError('invalid_entry_uuid'));

    expect(() =>
      repository.enqueue(
        SCOPE_ID,
        PLAYLIST_1_UUID,
        playlistOperation({ block_uuid: '00000000-0000-0000-0000-000000000000' })
      )
    ).toThrowError(new UserLibraryPlaylistOperationOutboxError('invalid_block_uuid'));

    expect(realm.objects(PendingUserOperation).length).toBe(0);
  });

  it('lists pending, failed, and crash-left syncing operations in creation order', () => {
    repository.enqueue(
      SCOPE_ID,
      PLAYLIST_1_UUID,
      playlistOperation({ idempotency_key: OPERATION_2_UUID }),
      {
        now: new Date('2026-06-20T04:57:00.000Z'),
      }
    );
    repository.enqueue(
      SCOPE_ID,
      PLAYLIST_1_UUID,
      playlistOperation({ idempotency_key: OPERATION_1_UUID }),
      {
        now: new Date('2026-06-20T04:56:00.000Z'),
      }
    );
    repository.enqueue(
      'user:user-2',
      PLAYLIST_1_UUID,
      playlistOperation({ idempotency_key: OPERATION_3_UUID })
    );

    realm.write(() => {
      const failed = realm.objectForPrimaryKey(
        PendingUserOperation,
        pendingPlaylistOperationScopedId(SCOPE_ID, OPERATION_2_UUID)
      );
      const syncing = realm.objectForPrimaryKey(
        PendingUserOperation,
        pendingPlaylistOperationScopedId(SCOPE_ID, OPERATION_1_UUID)
      );
      failed!.syncStatus = UserDataSyncStatus.Failed;
      syncing!.syncStatus = UserDataSyncStatus.Syncing;
    });

    expect(repository.listReplayable(SCOPE_ID).map((operation) => operation.uuid)).toEqual([
      OPERATION_1_UUID,
      OPERATION_2_UUID,
    ]);
  });
});

describe('UserLibraryPlaylistOperationReplayService', () => {
  let realm: Realm;
  let repository: UserLibraryPendingPlaylistOperationRepository;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'relisten-playlist-replay-'));
    realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema,
      schemaVersion: 1,
    });
    repository = new UserLibraryPendingPlaylistOperationRepository(realm);
  });

  afterEach(() => {
    realm.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('replays pending operations and reconciles canonical playlist snapshots', async () => {
    repository.enqueue(SCOPE_ID, PLAYLIST_1_UUID, playlistOperation(), {
      now: new Date('2026-06-20T04:55:00.000Z'),
    });
    realm.write(() => {
      realm.create(UserPlaylist.schema.name, {
        scopedId: scopedUserDataPrimaryKey(SCOPE_ID, PLAYLIST_1_UUID),
        scopeId: SCOPE_ID,
        uuid: PLAYLIST_1_UUID,
        shortId: 'short-1',
        name: 'Local playlist',
        visibility: UserPlaylistVisibility.Private,
        ownerUserUuid: USER_1_UUID,
        accessRole: UserPlaylistAccessRole.Owner,
        isOwner: true,
        isFollowing: false,
        isCollaborator: false,
        canEdit: true,
        currentRevision: 4,
        createdAt: new Date('2026-06-20T04:50:00.000Z'),
        updatedAt: new Date('2026-06-20T04:50:00.000Z'),
        deletedAt: null,
      });
      realm.create(UserPlaylistEntry.schema.name, {
        scopedId: scopedUserDataPrimaryKey(SCOPE_ID, OLD_ENTRY_UUID),
        scopeId: SCOPE_ID,
        uuid: OLD_ENTRY_UUID,
        playlistUuid: PLAYLIST_1_UUID,
        sourceTrackUuid: TRACK_2_UUID,
        position: 'z',
        createdAt: new Date('2026-06-20T04:50:00.000Z'),
        updatedAt: new Date('2026-06-20T04:50:00.000Z'),
        deletedAt: null,
      });
    });
    const postJson = vi.fn(async () => operationResponse());
    const service = new UserLibraryPlaylistOperationReplayService(
      realm,
      { postJson } as unknown as RelistenUserLibraryApiClient,
      repository
    );

    await expect(
      service.replayPending(SCOPE_ID, {
        now: new Date('2026-06-20T04:58:00.000Z'),
      })
    ).resolves.toEqual(
      expect.objectContaining({
        attempted: 1,
        succeeded: 1,
        failed: 0,
        skipped: 0,
      })
    );

    expect(postJson).toHaveBeenCalledWith(
      `/playlists/${PLAYLIST_1_UUID}/operations`,
      playlistOperation()
    );
    expect(
      realm.objectForPrimaryKey(
        PendingUserOperation,
        pendingPlaylistOperationScopedId(SCOPE_ID, OPERATION_1_UUID)
      )
    ).toEqual(
      expect.objectContaining({
        syncStatus: UserDataSyncStatus.Synced,
        attemptCount: 1,
        lastError: null,
      })
    );
    expect(
      realm.objectForPrimaryKey(UserPlaylist, scopedUserDataPrimaryKey(SCOPE_ID, PLAYLIST_1_UUID))
    ).toEqual(
      expect.objectContaining({
        name: 'Server playlist',
        accessRole: UserPlaylistAccessRole.Owner,
        isOwner: true,
        currentRevision: 5,
      })
    );
    expect(
      realm.objectForPrimaryKey(UserPlaylistEntry, scopedUserDataPrimaryKey(SCOPE_ID, ENTRY_1_UUID))
    ).toEqual(
      expect.objectContaining({
        playlistUuid: PLAYLIST_1_UUID,
        sourceTrackUuid: TRACK_1_UUID,
        position: 'a',
      })
    );
    expect(
      realm.objectForPrimaryKey(
        UserPlaylistEntry,
        scopedUserDataPrimaryKey(SCOPE_ID, OLD_ENTRY_UUID)
      )?.deletedAt
    ).toEqual(new Date('2026-06-20T04:58:00.000Z'));
  });

  it('stops same-playlist replay after a failure while continuing other playlists', async () => {
    repository.enqueue(
      SCOPE_ID,
      PLAYLIST_1_UUID,
      playlistOperation({ idempotency_key: OPERATION_1_UUID }),
      {
        now: new Date('2026-06-20T04:55:00.000Z'),
      }
    );
    repository.enqueue(
      SCOPE_ID,
      PLAYLIST_1_UUID,
      playlistOperation({ idempotency_key: OPERATION_2_UUID }),
      {
        now: new Date('2026-06-20T04:56:00.000Z'),
      }
    );
    repository.enqueue(
      SCOPE_ID,
      PLAYLIST_2_UUID,
      playlistOperation({ idempotency_key: OPERATION_3_UUID }),
      {
        now: new Date('2026-06-20T04:57:00.000Z'),
      }
    );
    const postJson = vi
      .fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(
        operationResponse({
          playlist: {
            ...operationResponse().playlist,
            playlist_uuid: PLAYLIST_2_UUID,
            short_id: 'short-2',
            current_revision: 1,
            entries: [],
          },
        })
      );
    const service = new UserLibraryPlaylistOperationReplayService(
      realm,
      { postJson } as unknown as RelistenUserLibraryApiClient,
      repository
    );

    const result = await service.replayPending(SCOPE_ID, {
      now: new Date('2026-06-20T04:58:00.000Z'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        attempted: 2,
        succeeded: 1,
        failed: 1,
        skipped: 1,
      })
    );
    expect(postJson).toHaveBeenCalledTimes(2);
    expect(postJson).toHaveBeenNthCalledWith(
      1,
      `/playlists/${PLAYLIST_1_UUID}/operations`,
      playlistOperation({ idempotency_key: OPERATION_1_UUID })
    );
    expect(postJson).toHaveBeenNthCalledWith(
      2,
      `/playlists/${PLAYLIST_2_UUID}/operations`,
      playlistOperation({ idempotency_key: OPERATION_3_UUID })
    );
    expect(
      realm.objectForPrimaryKey(
        PendingUserOperation,
        pendingPlaylistOperationScopedId(SCOPE_ID, OPERATION_1_UUID)
      )
    ).toEqual(
      expect.objectContaining({
        syncStatus: UserDataSyncStatus.Failed,
        attemptCount: 1,
        lastError: 'network unavailable',
      })
    );
    expect(
      realm.objectForPrimaryKey(
        PendingUserOperation,
        pendingPlaylistOperationScopedId(SCOPE_ID, OPERATION_2_UUID)
      )
    ).toEqual(
      expect.objectContaining({
        syncStatus: UserDataSyncStatus.Pending,
        attemptCount: 0,
      })
    );
    expect(
      realm.objectForPrimaryKey(
        PendingUserOperation,
        pendingPlaylistOperationScopedId(SCOPE_ID, OPERATION_3_UUID)
      )?.syncStatus
    ).toBe(UserDataSyncStatus.Synced);
  });

  it('blocks deterministic 4xx operation errors and retries later same-playlist operations next run', async () => {
    repository.enqueue(
      SCOPE_ID,
      PLAYLIST_1_UUID,
      playlistOperation({ idempotency_key: OPERATION_1_UUID }),
      { now: new Date('2026-06-20T04:55:00.000Z') }
    );
    repository.enqueue(
      SCOPE_ID,
      PLAYLIST_1_UUID,
      playlistOperation({ idempotency_key: OPERATION_2_UUID, entry_uuid: ENTRY_2_UUID }),
      { now: new Date('2026-06-20T04:56:00.000Z') }
    );
    const postJson = vi
      .fn()
      .mockRejectedValueOnce(
        new UserLibraryApiError(
          400,
          'POST',
          `/playlists/${PLAYLIST_1_UUID}/operations`,
          '{"error":"idempotency_key_conflict"}'
        )
      )
      .mockResolvedValueOnce(operationResponse());
    const service = new UserLibraryPlaylistOperationReplayService(
      realm,
      { postJson } as unknown as RelistenUserLibraryApiClient,
      repository
    );

    const first = await service.replayPending(SCOPE_ID, {
      now: new Date('2026-06-20T04:58:00.000Z'),
    });
    const second = await service.replayPending(SCOPE_ID, {
      now: new Date('2026-06-20T04:59:00.000Z'),
    });

    expect(first).toEqual(
      expect.objectContaining({
        attempted: 1,
        succeeded: 0,
        failed: 1,
        skipped: 1,
      })
    );
    expect(second).toEqual(
      expect.objectContaining({
        attempted: 1,
        succeeded: 1,
        failed: 0,
        skipped: 0,
      })
    );
    expect(postJson).toHaveBeenCalledTimes(2);
    expect(
      realm.objectForPrimaryKey(
        PendingUserOperation,
        pendingPlaylistOperationScopedId(SCOPE_ID, OPERATION_1_UUID)
      )
    ).toEqual(
      expect.objectContaining({
        syncStatus: UserDataSyncStatus.Blocked,
        attemptCount: 1,
        lastError: '{"error":"idempotency_key_conflict"}',
      })
    );
    expect(
      realm.objectForPrimaryKey(
        PendingUserOperation,
        pendingPlaylistOperationScopedId(SCOPE_ID, OPERATION_2_UUID)
      )?.syncStatus
    ).toBe(UserDataSyncStatus.Synced);
  });

  it('keeps auth failures retryable instead of permanently blocking operations', async () => {
    repository.enqueue(SCOPE_ID, PLAYLIST_1_UUID, playlistOperation(), {
      now: new Date('2026-06-20T04:55:00.000Z'),
    });
    const postJson = vi.fn(async () => {
      throw new UserLibraryApiError(
        401,
        'POST',
        `/playlists/${PLAYLIST_1_UUID}/operations`,
        '{"error":"unauthorized"}'
      );
    });
    const service = new UserLibraryPlaylistOperationReplayService(
      realm,
      { postJson } as unknown as RelistenUserLibraryApiClient,
      repository
    );

    await expect(
      service.replayPending(SCOPE_ID, { now: new Date('2026-06-20T04:58:00.000Z') })
    ).resolves.toEqual(
      expect.objectContaining({
        attempted: 1,
        succeeded: 0,
        failed: 1,
        skipped: 0,
      })
    );

    expect(
      realm.objectForPrimaryKey(
        PendingUserOperation,
        pendingPlaylistOperationScopedId(SCOPE_ID, OPERATION_1_UUID)
      )
    ).toEqual(
      expect.objectContaining({
        syncStatus: UserDataSyncStatus.Failed,
        attemptCount: 1,
        lastError: '{"error":"unauthorized"}',
      })
    );
    expect(repository.listReplayable(SCOPE_ID).map((operation) => operation.uuid)).toEqual([
      OPERATION_1_UUID,
    ]);
  });

  it('blocks corrupt local operation JSON before replaying it', async () => {
    repository.enqueue(SCOPE_ID, PLAYLIST_1_UUID, playlistOperation(), {
      now: new Date('2026-06-20T04:55:00.000Z'),
    });
    realm.write(() => {
      const operation = realm.objectForPrimaryKey(
        PendingUserOperation,
        pendingPlaylistOperationScopedId(SCOPE_ID, OPERATION_1_UUID)
      );
      operation!.operationJson = '{';
    });
    const postJson = vi.fn(async () => operationResponse());
    const service = new UserLibraryPlaylistOperationReplayService(
      realm,
      { postJson } as unknown as RelistenUserLibraryApiClient,
      repository
    );

    await expect(
      service.replayPending(SCOPE_ID, { now: new Date('2026-06-20T04:58:00.000Z') })
    ).resolves.toEqual(
      expect.objectContaining({
        attempted: 1,
        failed: 1,
      })
    );

    expect(postJson).not.toHaveBeenCalled();
    expect(
      realm.objectForPrimaryKey(
        PendingUserOperation,
        pendingPlaylistOperationScopedId(SCOPE_ID, OPERATION_1_UUID)
      )
    ).toEqual(
      expect.objectContaining({
        syncStatus: UserDataSyncStatus.Blocked,
        lastError: 'invalid_operation_json',
      })
    );
  });

  it('keeps malformed server responses retryable', async () => {
    repository.enqueue(SCOPE_ID, PLAYLIST_1_UUID, playlistOperation(), {
      now: new Date('2026-06-20T04:55:00.000Z'),
    });
    const postJson = vi.fn(async () => {
      throw new SyntaxError('Unexpected token');
    });
    const service = new UserLibraryPlaylistOperationReplayService(
      realm,
      { postJson } as unknown as RelistenUserLibraryApiClient,
      repository
    );

    await service.replayPending(SCOPE_ID, { now: new Date('2026-06-20T04:58:00.000Z') });

    expect(
      realm.objectForPrimaryKey(
        PendingUserOperation,
        pendingPlaylistOperationScopedId(SCOPE_ID, OPERATION_1_UUID)
      )
    ).toEqual(
      expect.objectContaining({
        syncStatus: UserDataSyncStatus.Failed,
        lastError: 'Unexpected token',
      })
    );
    expect(repository.listReplayable(SCOPE_ID).map((operation) => operation.uuid)).toEqual([
      OPERATION_1_UUID,
    ]);
  });

  it('returns a no-op result when replay is already running for the scope', async () => {
    repository.enqueue(SCOPE_ID, PLAYLIST_1_UUID, playlistOperation(), {
      now: new Date('2026-06-20T04:55:00.000Z'),
    });
    let resolveFirstReplay: (response: UserLibraryPlaylistOperationResponse) => void;
    const firstReplay = new Promise<UserLibraryPlaylistOperationResponse>((resolve) => {
      resolveFirstReplay = resolve;
    });
    const postJson = vi.fn(() => firstReplay);
    const service = new UserLibraryPlaylistOperationReplayService(
      realm,
      { postJson } as unknown as RelistenUserLibraryApiClient,
      repository
    );

    const first = service.replayPending(SCOPE_ID, {
      now: new Date('2026-06-20T04:58:00.000Z'),
    });
    await vi.waitFor(() => expect(postJson).toHaveBeenCalledTimes(1));

    await expect(service.replayPending(SCOPE_ID)).resolves.toEqual({
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      alreadyRunning: true,
      results: [],
    });

    resolveFirstReplay!(operationResponse());
    await expect(first).resolves.toEqual(
      expect.objectContaining({
        attempted: 1,
        succeeded: 1,
      })
    );
    expect(postJson).toHaveBeenCalledTimes(1);
  });
});
