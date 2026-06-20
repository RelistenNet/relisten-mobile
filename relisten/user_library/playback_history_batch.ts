import Realm from 'realm';
import {
  RelistenUserLibraryApiClient,
  safeUserLibraryErrorMessage,
  UserLibraryApiError,
  UserLibraryRequestOptions,
} from '@/relisten/api/user_library_client';
import { ScopedPlaybackHistoryEntry } from '@/relisten/realm/models/user_library/history';
import { UserDataSyncStatus } from '@/relisten/realm/models/user_library/sync';
import { scopedUserDataPrimaryKey } from '@/relisten/user_library/user_data_scope';

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_HISTORY_BATCH_SIZE = 500;
const activeHistoryUploadScopes = new Set<string>();

export interface PlaybackHistoryJournalInput {
  clientEventUuid: string;
  deviceId: string;
  sourceTrackUuid: string;
  sourceUuid: string;
  showUuid?: string | null;
  artistUuid?: string | null;
  playlistUuid?: string | null;
  playlistEntryUuid?: string | null;
  blockUuid?: string | null;
  blockPosition?: number | null;
  playedAt: Date;
  playbackFlags: number;
  platform: string;
  appVersion: string;
}

export interface RecordPlaybackHistoryOptions {
  historyEnabled?: boolean;
}

export interface ListPlaybackHistoryBatchableOptions {
  excludingScopedIds?: ReadonlySet<string>;
}

export interface PlaybackHistoryEventRequest {
  client_event_uuid: string;
  source_track_uuid: string;
  source_uuid: string;
  playlist_uuid?: string | null;
  playlist_entry_uuid?: string | null;
  block_uuid?: string | null;
  block_position?: number | null;
  played_at: string;
  platform: string;
  app_version: string;
  device_id: string;
}

export interface PlaybackHistoryBatchRequest {
  events: PlaybackHistoryEventRequest[];
}

export interface PlaybackHistoryEventResultResponse {
  client_event_uuid: string;
  status: 'accepted' | 'duplicate' | 'rejected_history_disabled' | string;
}

export interface PlaybackHistoryBatchResponse {
  history_enabled: boolean;
  accepted_count: number;
  duplicate_count: number;
  results: PlaybackHistoryEventResultResponse[];
}

export interface UploadPlaybackHistoryOptions {
  accessToken?: string;
  limit?: number;
  now?: Date;
  throwAuthenticationErrors?: boolean;
  shouldContinue?: () => boolean;
}

export interface UploadPlaybackHistoryResult {
  attempted: number;
  synced: number;
  failed: number;
  blocked: number;
  alreadyRunning: boolean;
  error?: string;
}

export class UserLibraryPlaybackHistoryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'UserLibraryPlaybackHistoryError';
  }
}

export function postUserLibraryPlaybackHistoryBatch(
  client: RelistenUserLibraryApiClient,
  request: PlaybackHistoryBatchRequest,
  options?: UserLibraryRequestOptions
): Promise<PlaybackHistoryBatchResponse> {
  assertPlaybackHistoryBatchRequest(request);
  return options
    ? client.postJson<PlaybackHistoryBatchResponse>('/history/batch', request, options)
    : client.postJson<PlaybackHistoryBatchResponse>('/history/batch', request);
}

export function scopedPlaybackHistoryEntryId(scopeId: string, clientEventUuid: string) {
  return scopedUserDataPrimaryKey(scopeId, `history:${clientEventUuid}`);
}

export class UserLibraryPlaybackHistoryRepository {
  constructor(private readonly realm: Realm) {}

  record(
    scopeId: string,
    input: PlaybackHistoryJournalInput,
    options: RecordPlaybackHistoryOptions = {}
  ): ScopedPlaybackHistoryEntry | undefined {
    if (options.historyEnabled === false) {
      return undefined;
    }

    assertPlaybackHistoryJournalInput(input);
    const scopedId = scopedPlaybackHistoryEntryId(scopeId, input.clientEventUuid);

    return this.write(() => {
      const existing = this.realm.objectForPrimaryKey(ScopedPlaybackHistoryEntry, scopedId);

      if (existing) {
        assertSameHistoryEntry(existing, input);
        return existing;
      }

      return this.realm.create(ScopedPlaybackHistoryEntry.schema.name, {
        scopedId,
        scopeId,
        clientEventUuid: input.clientEventUuid,
        deviceId: input.deviceId.trim(),
        sourceTrackUuid: input.sourceTrackUuid,
        sourceUuid: input.sourceUuid,
        showUuid: input.showUuid ?? null,
        artistUuid: input.artistUuid ?? null,
        playlistUuid: input.playlistUuid ?? null,
        playlistEntryUuid: input.playlistEntryUuid ?? null,
        blockUuid: input.blockUuid ?? null,
        blockPosition: input.blockPosition ?? null,
        playedAt: input.playedAt,
        playbackFlags: input.playbackFlags,
        platform: input.platform.trim(),
        appVersion: input.appVersion.trim(),
        syncStatus: UserDataSyncStatus.Pending,
        syncedAt: null,
        lastError: null,
      }) as unknown as ScopedPlaybackHistoryEntry;
    });
  }

  listBatchable(
    scopeId: string,
    limit: number = MAX_HISTORY_BATCH_SIZE,
    options: ListPlaybackHistoryBatchableOptions = {}
  ): ScopedPlaybackHistoryEntry[] {
    if (limit <= 0 || limit > MAX_HISTORY_BATCH_SIZE || !Number.isInteger(limit)) {
      throw new UserLibraryPlaybackHistoryError('invalid_history_batch_limit');
    }

    return [...this.realm.objects(ScopedPlaybackHistoryEntry)]
      .filter(
        (entry) =>
          entry.scopeId === scopeId &&
          !options.excludingScopedIds?.has(entry.scopedId) &&
          (entry.syncStatus === UserDataSyncStatus.Pending ||
            entry.syncStatus === UserDataSyncStatus.Syncing ||
            entry.syncStatus === UserDataSyncStatus.Failed)
      )
      .sort(compareHistoryEntries)
      .slice(0, limit);
  }

  markSyncing(entries: ScopedPlaybackHistoryEntry[]) {
    this.write(() => {
      for (const entry of entries) {
        entry.syncStatus = UserDataSyncStatus.Syncing;
        entry.lastError = undefined;
      }
    });
  }

  markFailed(entries: ScopedPlaybackHistoryEntry[], error: string) {
    this.write(() => {
      for (const entry of entries) {
        entry.syncStatus = UserDataSyncStatus.Failed;
        entry.lastError = error;
      }
    });
  }

  applyBatchResponse(
    scopeId: string,
    response: PlaybackHistoryBatchResponse,
    options: { syncedAt?: Date } = {}
  ) {
    const syncedAt = options.syncedAt ?? new Date();

    this.write(() => {
      for (const result of response.results) {
        const entry = this.realm.objectForPrimaryKey(
          ScopedPlaybackHistoryEntry,
          scopedPlaybackHistoryEntryId(scopeId, result.client_event_uuid)
        );

        if (!entry) {
          continue;
        }

        if (result.status === 'accepted' || result.status === 'duplicate') {
          entry.syncStatus = UserDataSyncStatus.Synced;
          entry.syncedAt = syncedAt;
          entry.lastError = undefined;
          continue;
        }

        if (result.status === 'rejected_history_disabled') {
          entry.syncStatus = UserDataSyncStatus.Blocked;
          entry.lastError = result.status;
          continue;
        }

        entry.syncStatus = UserDataSyncStatus.Failed;
        entry.lastError = result.status;
      }
    });
  }

  private write<T>(callback: () => T): T {
    return this.realm.isInTransaction ? callback() : this.realm.write(callback);
  }
}

export class UserLibraryPlaybackHistoryUploadService {
  private readonly repository: UserLibraryPlaybackHistoryRepository;

  constructor(
    private readonly realm: Realm,
    private readonly client: RelistenUserLibraryApiClient,
    repository?: UserLibraryPlaybackHistoryRepository
  ) {
    this.repository = repository ?? new UserLibraryPlaybackHistoryRepository(realm);
  }

  async flushPending(
    scopeId: string,
    options: UploadPlaybackHistoryOptions = {}
  ): Promise<UploadPlaybackHistoryResult> {
    if (activeHistoryUploadScopes.has(scopeId)) {
      return emptyUploadResult({ alreadyRunning: true });
    }

    activeHistoryUploadScopes.add(scopeId);
    try {
      return await this.flushPendingUnlocked(scopeId, options);
    } finally {
      activeHistoryUploadScopes.delete(scopeId);
    }
  }

  private async flushPendingUnlocked(
    scopeId: string,
    options: UploadPlaybackHistoryOptions
  ): Promise<UploadPlaybackHistoryResult> {
    const result = emptyUploadResult();
    const attemptedScopedIds = new Set<string>();

    while (shouldContinue(options)) {
      const entries = this.repository.listBatchable(scopeId, options.limit, {
        excludingScopedIds: attemptedScopedIds,
      });

      if (entries.length === 0) {
        return result;
      }

      for (const entry of entries) {
        attemptedScopedIds.add(entry.scopedId);
      }

      this.repository.markSyncing(entries);

      try {
        const response = await postUserLibraryPlaybackHistoryBatch(
          this.client,
          buildPlaybackHistoryBatchRequest(entries),
          options.accessToken ? { accessToken: options.accessToken } : undefined
        );

        if (!shouldContinue(options)) {
          this.repository.markFailed(entries, 'stale_scope');
          addUploadResult(result, {
            attempted: entries.length,
            failed: entries.length,
            error: 'stale_scope',
          });
          return result;
        }

        this.repository.applyBatchResponse(scopeId, response, { syncedAt: options.now });
        this.markMissingBatchResultsFailed(entries, response);
        addUploadResult(result, uploadResultFromResponse(entries.length, response));
      } catch (error) {
        const errorMessage = safeUserLibraryErrorMessage(error);
        this.repository.markFailed(entries, errorMessage);

        if (options.throwAuthenticationErrors && isUnauthorizedApiError(error)) {
          throw error;
        }

        addUploadResult(result, {
          attempted: entries.length,
          failed: entries.length,
          error: errorMessage,
        });
        return result;
      }
    }

    return result;
  }

  private markMissingBatchResultsFailed(
    entries: ScopedPlaybackHistoryEntry[],
    response: PlaybackHistoryBatchResponse
  ) {
    const resultEventUuids = new Set(
      response.results.map((result) => result.client_event_uuid.toLowerCase())
    );
    const missingEntries = entries.filter(
      (entry) => !resultEventUuids.has(entry.clientEventUuid.toLowerCase())
    );

    if (missingEntries.length > 0) {
      this.repository.markFailed(missingEntries, 'missing_history_batch_result');
    }
  }
}

export function buildPlaybackHistoryBatchRequest(
  entries: ScopedPlaybackHistoryEntry[]
): PlaybackHistoryBatchRequest {
  if (entries.length === 0 || entries.length > MAX_HISTORY_BATCH_SIZE) {
    throw new UserLibraryPlaybackHistoryError('invalid_history_batch');
  }

  return {
    events: entries.map(playbackHistoryEventRequestFromEntry),
  };
}

function playbackHistoryEventRequestFromEntry(
  entry: ScopedPlaybackHistoryEntry
): PlaybackHistoryEventRequest {
  return {
    client_event_uuid: entry.clientEventUuid,
    source_track_uuid: entry.sourceTrackUuid,
    source_uuid: entry.sourceUuid,
    playlist_uuid: entry.playlistUuid ?? null,
    playlist_entry_uuid: entry.playlistEntryUuid ?? null,
    block_uuid: entry.blockUuid ?? null,
    block_position: entry.blockPosition ?? null,
    played_at: entry.playedAt.toISOString(),
    platform: entry.platform ?? '',
    app_version: entry.appVersion ?? '',
    device_id: entry.deviceId,
  };
}

function assertPlaybackHistoryBatchRequest(request: PlaybackHistoryBatchRequest) {
  if (!request.events.length || request.events.length > MAX_HISTORY_BATCH_SIZE) {
    throw new UserLibraryPlaybackHistoryError('invalid_history_batch');
  }

  for (const event of request.events) {
    assertGuid('client_event_uuid', event.client_event_uuid);
    assertGuid('source_track_uuid', event.source_track_uuid);
    assertGuid('source_uuid', event.source_uuid);
    assertOptionalGuid('playlist_uuid', event.playlist_uuid);
    assertOptionalGuid('playlist_entry_uuid', event.playlist_entry_uuid);
    assertOptionalGuid('block_uuid', event.block_uuid);

    if (!!event.playlist_uuid !== !!event.playlist_entry_uuid) {
      throw new UserLibraryPlaybackHistoryError('invalid_playlist_attribution');
    }

    if ((event.block_uuid || event.block_position != null) && !event.playlist_uuid) {
      throw new UserLibraryPlaybackHistoryError('invalid_playlist_attribution');
    }

    assertNonBlank('platform', event.platform);
    assertNonBlank('app_version', event.app_version);
    assertNonBlank('device_id', event.device_id);
  }
}

function assertPlaybackHistoryJournalInput(input: PlaybackHistoryJournalInput) {
  assertGuid('client_event_uuid', input.clientEventUuid);
  assertGuid('source_track_uuid', input.sourceTrackUuid);
  assertGuid('source_uuid', input.sourceUuid);
  assertOptionalGuid('show_uuid', input.showUuid);
  assertOptionalGuid('artist_uuid', input.artistUuid);
  assertOptionalGuid('playlist_uuid', input.playlistUuid);
  assertOptionalGuid('playlist_entry_uuid', input.playlistEntryUuid);
  assertOptionalGuid('block_uuid', input.blockUuid);
  assertNonBlank('device_id', input.deviceId);
  assertNonBlank('platform', input.platform);
  assertNonBlank('app_version', input.appVersion);

  if (!!input.playlistUuid !== !!input.playlistEntryUuid) {
    throw new UserLibraryPlaybackHistoryError('invalid_playlist_attribution');
  }

  if ((input.blockUuid || input.blockPosition != null) && !input.playlistUuid) {
    throw new UserLibraryPlaybackHistoryError('invalid_playlist_attribution');
  }

  if (Number.isNaN(input.playedAt.getTime())) {
    throw new UserLibraryPlaybackHistoryError('invalid_played_at');
  }
}

function assertSameHistoryEntry(
  existing: ScopedPlaybackHistoryEntry,
  input: PlaybackHistoryJournalInput
) {
  if (
    existing.deviceId !== input.deviceId.trim() ||
    existing.sourceTrackUuid !== input.sourceTrackUuid ||
    existing.sourceUuid !== input.sourceUuid ||
    optionalValue(existing.showUuid) !== optionalValue(input.showUuid) ||
    optionalValue(existing.artistUuid) !== optionalValue(input.artistUuid) ||
    optionalValue(existing.playlistUuid) !== optionalValue(input.playlistUuid) ||
    optionalValue(existing.playlistEntryUuid) !== optionalValue(input.playlistEntryUuid) ||
    optionalValue(existing.blockUuid) !== optionalValue(input.blockUuid) ||
    optionalNumber(existing.blockPosition) !== optionalNumber(input.blockPosition) ||
    existing.playedAt.getTime() !== input.playedAt.getTime() ||
    existing.playbackFlags !== input.playbackFlags ||
    existing.platform !== input.platform.trim() ||
    existing.appVersion !== input.appVersion.trim()
  ) {
    throw new UserLibraryPlaybackHistoryError('client_event_uuid_conflict');
  }
}

function assertGuid(label: string, value: string) {
  if (!GUID_PATTERN.test(value) || value.toLowerCase() === EMPTY_UUID) {
    throw new UserLibraryPlaybackHistoryError(`invalid_${label}`);
  }
}

function assertOptionalGuid(label: string, value?: string | null) {
  if (value !== undefined && value !== null) {
    assertGuid(label, value);
  }
}

function assertNonBlank(label: string, value: string) {
  if (!value.trim()) {
    throw new UserLibraryPlaybackHistoryError(`invalid_${label}`);
  }
}

function optionalValue(value?: string | null) {
  return value ?? null;
}

function optionalNumber(value?: number | null) {
  return value ?? null;
}

function compareHistoryEntries(
  left: ScopedPlaybackHistoryEntry,
  right: ScopedPlaybackHistoryEntry
) {
  const playedAtDiff = left.playedAt.getTime() - right.playedAt.getTime();
  return playedAtDiff === 0
    ? left.clientEventUuid.localeCompare(right.clientEventUuid)
    : playedAtDiff;
}

function shouldContinue(options: UploadPlaybackHistoryOptions) {
  return options.shouldContinue ? options.shouldContinue() : true;
}

function isUnauthorizedApiError(error: unknown) {
  return error instanceof UserLibraryApiError && error.status === 401;
}

function uploadResultFromResponse(
  attempted: number,
  response: PlaybackHistoryBatchResponse
): UploadPlaybackHistoryResult {
  const synced = response.results.filter(
    (result) => result.status === 'accepted' || result.status === 'duplicate'
  ).length;
  const blocked = response.results.filter(
    (result) => result.status === 'rejected_history_disabled'
  ).length;

  return {
    attempted,
    synced,
    blocked,
    failed: attempted - synced - blocked,
    alreadyRunning: false,
  };
}

function addUploadResult(
  result: UploadPlaybackHistoryResult,
  next: Partial<UploadPlaybackHistoryResult>
) {
  result.attempted += next.attempted ?? 0;
  result.synced += next.synced ?? 0;
  result.failed += next.failed ?? 0;
  result.blocked += next.blocked ?? 0;
  result.alreadyRunning = result.alreadyRunning || next.alreadyRunning === true;
  result.error = next.error ?? result.error;
}

function emptyUploadResult(
  overrides: Partial<UploadPlaybackHistoryResult> = {}
): UploadPlaybackHistoryResult {
  return {
    attempted: 0,
    synced: 0,
    failed: 0,
    blocked: 0,
    alreadyRunning: false,
    ...overrides,
  };
}
