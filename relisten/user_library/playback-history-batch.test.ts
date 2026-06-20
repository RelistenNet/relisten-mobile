import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Realm from 'realm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RelistenUserLibraryApiClient } from '@/relisten/api/user_library_client';
import { createPlaylistQueueV2Item, queueV2HistoryAttribution } from '@/relisten/player/queue_v2';
import { ScopedPlaybackHistoryEntry } from '@/relisten/realm/models/user_library/history';
import { UserDataSyncStatus } from '@/relisten/realm/models/user_library/sync';
import {
  buildPlaybackHistoryBatchRequest,
  PlaybackHistoryBatchRequest,
  PlaybackHistoryJournalInput,
  postUserLibraryPlaybackHistoryBatch,
  scopedPlaybackHistoryEntryId,
  UserLibraryPlaybackHistoryError,
  UserLibraryPlaybackHistoryRepository,
  UserLibraryPlaybackHistoryUploadService,
} from '@/relisten/user_library/playback_history_batch';

const SCOPE_1_ID = 'user:11111111-1111-4111-8111-111111111111';
const SCOPE_2_ID = 'user:22222222-2222-4222-8222-222222222222';
const EVENT_1_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EVENT_2_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const EVENT_3_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac';
const TRACK_1_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TRACK_2_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc';
const SOURCE_1_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SOURCE_2_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccd';
const SHOW_1_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ARTIST_1_UUID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const PLAYLIST_UUID = '99999999-9999-4999-8999-999999999999';
const PLAYLIST_ENTRY_UUID = '88888888-8888-4888-8888-888888888888';
const BLOCK_UUID = '77777777-7777-4777-8777-777777777777';

function historyInput(
  overrides: Partial<PlaybackHistoryJournalInput> = {}
): PlaybackHistoryJournalInput {
  return {
    clientEventUuid: EVENT_1_UUID,
    deviceId: ' device-1 ',
    sourceTrackUuid: TRACK_1_UUID,
    sourceUuid: SOURCE_1_UUID,
    showUuid: SHOW_1_UUID,
    artistUuid: ARTIST_1_UUID,
    playedAt: new Date('2026-06-20T05:40:00.000Z'),
    playbackFlags: 5,
    platform: ' iOS ',
    appVersion: ' 4.2.1 ',
    ...overrides,
  };
}

describe('postUserLibraryPlaybackHistoryBatch', () => {
  it('posts batch history payloads to the user-library endpoint with explicit auth', async () => {
    const response = {
      history_enabled: true,
      accepted_count: 1,
      duplicate_count: 0,
      results: [{ client_event_uuid: EVENT_1_UUID, status: 'accepted' }],
    };
    const postJson = vi.fn(async () => response);
    const client = { postJson } as unknown as RelistenUserLibraryApiClient;
    const request = {
      events: [
        {
          client_event_uuid: EVENT_1_UUID,
          source_track_uuid: TRACK_1_UUID,
          source_uuid: SOURCE_1_UUID,
          playlist_uuid: null,
          playlist_entry_uuid: null,
          block_uuid: null,
          block_position: null,
          played_at: '2026-06-20T05:40:00.000Z',
          platform: 'ios',
          app_version: '4.2.1',
          device_id: 'device-1',
        },
      ],
    };

    await expect(
      postUserLibraryPlaybackHistoryBatch(client, request, { accessToken: 'access-1' })
    ).resolves.toBe(response);

    expect(postJson).toHaveBeenCalledWith('/history/batch', request, {
      accessToken: 'access-1',
    });
  });
});

describe('UserLibraryPlaybackHistoryRepository', () => {
  let realm: Realm;
  let repository: UserLibraryPlaybackHistoryRepository;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'relisten-history-batch-'));
    realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema: [ScopedPlaybackHistoryEntry],
      schemaVersion: 1,
    });
    repository = new UserLibraryPlaybackHistoryRepository(realm);
  });

  afterEach(() => {
    realm.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('records idempotent scoped journal rows with playlist and block attribution', () => {
    const playlistAttribution = queueV2HistoryAttribution(
      createPlaylistQueueV2Item({
        playlistUuid: PLAYLIST_UUID,
        playlistEntryUuid: PLAYLIST_ENTRY_UUID,
        sourceTrackUuid: TRACK_1_UUID,
        blockUuid: BLOCK_UUID,
        blockPosition: 2,
      })
    );
    const input = historyInput({
      ...playlistAttribution,
    });

    const first = repository.record(SCOPE_1_ID, input);
    const second = repository.record(SCOPE_1_ID, input);

    expect(second?.scopedId).toBe(first?.scopedId);
    expect(first).toEqual(
      expect.objectContaining({
        scopedId: scopedPlaybackHistoryEntryId(SCOPE_1_ID, EVENT_1_UUID),
        scopeId: SCOPE_1_ID,
        clientEventUuid: EVENT_1_UUID,
        deviceId: 'device-1',
        sourceTrackUuid: TRACK_1_UUID,
        sourceUuid: SOURCE_1_UUID,
        showUuid: SHOW_1_UUID,
        artistUuid: ARTIST_1_UUID,
        playlistUuid: PLAYLIST_UUID,
        playlistEntryUuid: PLAYLIST_ENTRY_UUID,
        blockUuid: BLOCK_UUID,
        blockPosition: 2,
        platform: 'iOS',
        appVersion: '4.2.1',
        syncStatus: UserDataSyncStatus.Pending,
      })
    );
    expect(realm.objects(ScopedPlaybackHistoryEntry).length).toBe(1);

    expect(() =>
      repository.record(SCOPE_1_ID, historyInput({ sourceTrackUuid: TRACK_2_UUID }))
    ).toThrowError(new UserLibraryPlaybackHistoryError('client_event_uuid_conflict'));
  });

  it('does not write scoped rows when authenticated history is disabled', () => {
    const recorded = repository.record(SCOPE_1_ID, historyInput(), { historyEnabled: false });

    expect(recorded).toBeUndefined();
    expect(realm.objects(ScopedPlaybackHistoryEntry).length).toBe(0);
  });

  it('lists uploadable rows by scope in stable played-at order', () => {
    repository.record(
      SCOPE_1_ID,
      historyInput({
        clientEventUuid: EVENT_2_UUID,
        sourceTrackUuid: TRACK_2_UUID,
        sourceUuid: SOURCE_2_UUID,
        playedAt: new Date('2026-06-20T05:42:00.000Z'),
      })
    );
    repository.record(SCOPE_1_ID, historyInput({ clientEventUuid: EVENT_1_UUID }));
    repository.record(SCOPE_2_ID, historyInput({ clientEventUuid: EVENT_3_UUID }));
    const first = realm.objectForPrimaryKey(
      ScopedPlaybackHistoryEntry,
      scopedPlaybackHistoryEntryId(SCOPE_1_ID, EVENT_1_UUID)
    );
    const second = realm.objectForPrimaryKey(
      ScopedPlaybackHistoryEntry,
      scopedPlaybackHistoryEntryId(SCOPE_1_ID, EVENT_2_UUID)
    );
    realm.write(() => {
      first!.syncStatus = UserDataSyncStatus.Synced;
      second!.syncStatus = UserDataSyncStatus.Failed;
    });

    expect(repository.listBatchable(SCOPE_1_ID).map((entry) => entry.clientEventUuid)).toEqual([
      EVENT_2_UUID,
    ]);
  });

  it('builds server batch payloads from scoped rows', () => {
    const entry = repository.record(
      SCOPE_1_ID,
      historyInput({
        playlistUuid: PLAYLIST_UUID,
        playlistEntryUuid: PLAYLIST_ENTRY_UUID,
        blockUuid: BLOCK_UUID,
        blockPosition: 1,
      })
    )!;

    expect(buildPlaybackHistoryBatchRequest([entry])).toEqual({
      events: [
        {
          client_event_uuid: EVENT_1_UUID,
          source_track_uuid: TRACK_1_UUID,
          source_uuid: SOURCE_1_UUID,
          playlist_uuid: PLAYLIST_UUID,
          playlist_entry_uuid: PLAYLIST_ENTRY_UUID,
          block_uuid: BLOCK_UUID,
          block_position: 1,
          played_at: '2026-06-20T05:40:00.000Z',
          platform: 'iOS',
          app_version: '4.2.1',
          device_id: 'device-1',
        },
      ],
    });
  });

  it('marks accepted, duplicate, disabled, and failed batch results', () => {
    const accepted = repository.record(
      SCOPE_1_ID,
      historyInput({ clientEventUuid: EVENT_1_UUID })
    )!;
    const duplicate = repository.record(
      SCOPE_1_ID,
      historyInput({ clientEventUuid: EVENT_2_UUID })
    )!;
    const disabled = repository.record(
      SCOPE_1_ID,
      historyInput({ clientEventUuid: EVENT_3_UUID })
    )!;
    repository.markSyncing([accepted, duplicate, disabled]);

    repository.applyBatchResponse(
      SCOPE_1_ID,
      {
        history_enabled: true,
        accepted_count: 1,
        duplicate_count: 1,
        results: [
          { client_event_uuid: EVENT_1_UUID, status: 'accepted' },
          { client_event_uuid: EVENT_2_UUID, status: 'duplicate' },
          { client_event_uuid: EVENT_3_UUID, status: 'rejected_history_disabled' },
        ],
      },
      { syncedAt: new Date('2026-06-20T05:45:00.000Z') }
    );

    expect(accepted).toEqual(
      expect.objectContaining({
        syncStatus: UserDataSyncStatus.Synced,
        syncedAt: new Date('2026-06-20T05:45:00.000Z'),
      })
    );
    expect(duplicate.syncStatus).toBe(UserDataSyncStatus.Synced);
    expect(disabled).toEqual(
      expect.objectContaining({
        syncStatus: UserDataSyncStatus.Blocked,
        lastError: 'rejected_history_disabled',
      })
    );

    repository.markFailed([disabled], 'network');
    expect(disabled).toEqual(
      expect.objectContaining({
        syncStatus: UserDataSyncStatus.Failed,
        lastError: 'network',
      })
    );
  });

  it('rejects invalid history identifiers and playlist attribution', () => {
    expect(() =>
      repository.record(SCOPE_1_ID, historyInput({ clientEventUuid: 'event-1' }))
    ).toThrowError(new UserLibraryPlaybackHistoryError('invalid_client_event_uuid'));

    expect(() =>
      repository.record(SCOPE_1_ID, historyInput({ playlistUuid: PLAYLIST_UUID }))
    ).toThrowError(new UserLibraryPlaybackHistoryError('invalid_playlist_attribution'));

    expect(() =>
      repository.record(SCOPE_1_ID, historyInput({ blockUuid: BLOCK_UUID }))
    ).toThrowError(new UserLibraryPlaybackHistoryError('invalid_playlist_attribution'));
  });
});

describe('UserLibraryPlaybackHistoryUploadService', () => {
  let realm: Realm;
  let repository: UserLibraryPlaybackHistoryRepository;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'relisten-history-upload-'));
    realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema: [ScopedPlaybackHistoryEntry],
      schemaVersion: 1,
    });
    repository = new UserLibraryPlaybackHistoryRepository(realm);
  });

  afterEach(() => {
    realm.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('flushes batchable rows with explicit auth and applies server results', async () => {
    const entry = repository.record(SCOPE_1_ID, historyInput())!;
    const postJson = vi.fn(async () => ({
      history_enabled: true,
      accepted_count: 1,
      duplicate_count: 0,
      results: [{ client_event_uuid: EVENT_1_UUID, status: 'accepted' }],
    }));
    const client = { postJson } as unknown as RelistenUserLibraryApiClient;
    const service = new UserLibraryPlaybackHistoryUploadService(realm, client, repository);

    await expect(
      service.flushPending(SCOPE_1_ID, {
        accessToken: 'access-1',
        now: new Date('2026-06-20T05:46:00.000Z'),
      })
    ).resolves.toEqual({
      attempted: 1,
      synced: 1,
      failed: 0,
      blocked: 0,
      alreadyRunning: false,
    });

    expect(postJson).toHaveBeenCalledWith(
      '/history/batch',
      buildPlaybackHistoryBatchRequest([entry]),
      { accessToken: 'access-1' }
    );
    expect(entry).toEqual(
      expect.objectContaining({
        syncStatus: UserDataSyncStatus.Synced,
        syncedAt: new Date('2026-06-20T05:46:00.000Z'),
      })
    );
  });

  it('drains more than one server batch in a single flush', async () => {
    for (let index = 0; index < 501; index += 1) {
      const playedAtMinute = String(40 + (index % 10)).padStart(2, '0');

      repository.record(
        SCOPE_1_ID,
        historyInput({
          clientEventUuid: eventUuid(index),
          playedAt: new Date(`2026-06-20T05:${playedAtMinute}:00.000Z`),
        })
      );
    }
    const postJson = vi.fn(async (_path: string, request: PlaybackHistoryBatchRequest) => ({
      history_enabled: true,
      accepted_count: request.events.length,
      duplicate_count: 0,
      results: request.events.map((event) => ({
        client_event_uuid: event.client_event_uuid,
        status: 'accepted',
      })),
    }));
    const client = { postJson } as unknown as RelistenUserLibraryApiClient;
    const service = new UserLibraryPlaybackHistoryUploadService(realm, client, repository);

    await expect(service.flushPending(SCOPE_1_ID, { accessToken: 'access-1' })).resolves.toEqual({
      attempted: 501,
      synced: 501,
      failed: 0,
      blocked: 0,
      alreadyRunning: false,
    });

    expect(postJson).toHaveBeenCalledTimes(2);
    expect(postJson.mock.calls.map(([, request]) => request.events.length)).toEqual([500, 1]);
    expect(
      [...realm.objects(ScopedPlaybackHistoryEntry)].filter(
        (entry) => entry.syncStatus === UserDataSyncStatus.Synced
      ).length
    ).toBe(501);
  });

  it('marks rows failed when upload fails without losing retryability', async () => {
    const entry = repository.record(SCOPE_1_ID, historyInput())!;
    const postJson = vi.fn(async () => {
      throw new Error('network');
    });
    const client = { postJson } as unknown as RelistenUserLibraryApiClient;
    const service = new UserLibraryPlaybackHistoryUploadService(realm, client, repository);

    await expect(service.flushPending(SCOPE_1_ID, { accessToken: 'access-1' })).resolves.toEqual({
      attempted: 1,
      synced: 0,
      failed: 1,
      blocked: 0,
      alreadyRunning: false,
      error: 'network',
    });

    expect(entry).toEqual(
      expect.objectContaining({
        syncStatus: UserDataSyncStatus.Failed,
        lastError: 'network',
      })
    );
  });

  it('marks rows with missing server results failed instead of leaving them syncing', async () => {
    const entry = repository.record(SCOPE_1_ID, historyInput())!;
    const postJson = vi.fn(async () => ({
      history_enabled: true,
      accepted_count: 0,
      duplicate_count: 0,
      results: [],
    }));
    const client = { postJson } as unknown as RelistenUserLibraryApiClient;
    const service = new UserLibraryPlaybackHistoryUploadService(realm, client, repository);

    await expect(service.flushPending(SCOPE_1_ID, { accessToken: 'access-1' })).resolves.toEqual({
      attempted: 1,
      synced: 0,
      failed: 1,
      blocked: 0,
      alreadyRunning: false,
    });
    expect(entry).toEqual(
      expect.objectContaining({
        syncStatus: UserDataSyncStatus.Failed,
        lastError: 'missing_history_batch_result',
      })
    );
  });
});

function eventUuid(index: number) {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${index.toString(16).padStart(12, '0')}`;
}
