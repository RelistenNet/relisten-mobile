import Realm from 'realm';
import {
  RelistenUserLibraryApiClient,
  safeUserLibraryErrorMessage,
  UserLibraryApiError,
  UserLibraryRequestOptions,
} from '@/relisten/api/user_library_client';
import {
  PendingUserOperation,
  UserDataSyncStatus,
} from '@/relisten/realm/models/user_library/sync';
import {
  applyUserLibraryPlaylistSnapshot,
  UserLibraryPlaylistResponse,
} from '@/relisten/user_library/playlist_sync';
import { scopedUserDataPrimaryKey } from '@/relisten/user_library/user_data_scope';

export const USER_LIBRARY_PLAYLIST_ENTITY_TYPE = 'playlist';
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const activeReplayScopes = new Set<string>();

export enum UserLibraryPlaylistOperationType {
  AddTrack = 'add_track',
  AddTracksAsBlock = 'add_tracks_as_block',
  AddSourceRangeAsBlock = 'add_source_range_as_block',
  MoveEntry = 'move_entry',
  MoveBlock = 'move_block',
}

export interface UserLibraryPlaylistPlacementRequest {
  after_entry_uuid?: string | null;
  before_entry_uuid?: string | null;
  target_block_uuid?: string | null;
  target_block_index?: number | null;
  position_hint?: string | null;
}

export interface UserLibraryPlaylistOperationRequest {
  op: UserLibraryPlaylistOperationType;
  idempotency_key: string;
  base_revision?: number | null;
  entry_uuid?: string | null;
  source_track_uuid?: string | null;
  source_uuid?: string | null;
  block_uuid?: string | null;
  entry_uuids?: string[];
  source_track_uuids?: string[];
  start_track_position?: number | null;
  end_track_position?: number | null;
  placement?: UserLibraryPlaylistPlacementRequest | null;
}

export interface UserLibraryPlaylistOperationResponse {
  result_revision: number;
  result_status: string;
  playlist: UserLibraryPlaylistResponse;
}

export interface PendingPlaylistOperationOptions {
  now?: Date;
}

export interface ReplayPlaylistOperationsOptions {
  now?: Date;
  maxOperations?: number;
  accessToken?: string;
  throwAuthenticationErrors?: boolean;
  shouldContinue?: () => boolean;
}

export interface ReplayPlaylistOperationResult {
  operationUuid: string;
  playlistUuid?: string;
  status: 'synced' | 'failed' | 'skipped';
  resultStatus?: string;
  error?: string;
}

export interface ReplayPlaylistOperationsResult {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  alreadyRunning: boolean;
  results: ReplayPlaylistOperationResult[];
}

export class UserLibraryPlaylistOperationOutboxError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'UserLibraryPlaylistOperationOutboxError';
  }
}

export function postUserLibraryPlaylistOperation(
  client: RelistenUserLibraryApiClient,
  playlistUuid: string,
  operation: UserLibraryPlaylistOperationRequest,
  options?: UserLibraryRequestOptions
): Promise<UserLibraryPlaylistOperationResponse> {
  assertPlaylistOperationEnvelope(playlistUuid, operation);
  const path = `/playlists/${encodeURIComponent(playlistUuid)}/operations`;
  return options
    ? client.postJson<UserLibraryPlaylistOperationResponse>(path, operation, options)
    : client.postJson<UserLibraryPlaylistOperationResponse>(path, operation);
}

export function pendingPlaylistOperationScopedId(scopeId: string, idempotencyKey: string) {
  return scopedUserDataPrimaryKey(scopeId, `operation:${idempotencyKey}`);
}

export function serializeUserLibraryPlaylistOperation(
  operation: UserLibraryPlaylistOperationRequest
) {
  return JSON.stringify(normalizeJsonValue(operation));
}

export function parsePendingPlaylistOperation(
  operation: PendingUserOperation
): UserLibraryPlaylistOperationRequest {
  let parsed: UserLibraryPlaylistOperationRequest;

  try {
    parsed = JSON.parse(operation.operationJson) as UserLibraryPlaylistOperationRequest;
  } catch {
    throw new UserLibraryPlaylistOperationOutboxError('invalid_operation_json');
  }

  assertSupportedPlaylistOperation(parsed);
  return parsed;
}

export class UserLibraryPendingPlaylistOperationRepository {
  constructor(private readonly realm: Realm) {}

  enqueue(
    scopeId: string,
    playlistUuid: string,
    operation: UserLibraryPlaylistOperationRequest,
    options: PendingPlaylistOperationOptions = {}
  ): PendingUserOperation {
    assertPlaylistOperationEnvelope(playlistUuid, operation);

    const now = options.now ?? new Date();
    const operationJson = serializeUserLibraryPlaylistOperation(operation);
    const scopedId = pendingPlaylistOperationScopedId(scopeId, operation.idempotency_key);

    return this.write(() => {
      const existing = this.realm.objectForPrimaryKey(PendingUserOperation, scopedId);

      if (existing) {
        assertSamePendingOperation(existing, playlistUuid, operationJson);
        return existing;
      }

      return this.realm.create(PendingUserOperation.schema.name, {
        scopedId,
        scopeId,
        uuid: operation.idempotency_key,
        operationType: operation.op,
        entityType: USER_LIBRARY_PLAYLIST_ENTITY_TYPE,
        entityUuid: playlistUuid,
        operationJson,
        baseRevision: operation.base_revision ?? null,
        syncStatus: UserDataSyncStatus.Pending,
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
        lastAttemptedAt: null,
        lastError: null,
      }) as unknown as PendingUserOperation;
    });
  }

  listReplayable(scopeId: string): PendingUserOperation[] {
    return [...this.realm.objects(PendingUserOperation)]
      .filter(
        (operation) =>
          operation.scopeId === scopeId &&
          operation.entityType === USER_LIBRARY_PLAYLIST_ENTITY_TYPE &&
          isReplayableStatus(operation.syncStatus)
      )
      .sort(comparePendingOperations);
  }

  markSyncing(operation: PendingUserOperation, now: Date) {
    this.write(() => {
      operation.syncStatus = UserDataSyncStatus.Syncing;
      operation.attemptCount += 1;
      operation.lastAttemptedAt = now;
      operation.lastError = undefined;
      operation.updatedAt = now;
    });
  }

  markSynced(operation: PendingUserOperation, now: Date) {
    this.write(() => {
      operation.syncStatus = UserDataSyncStatus.Synced;
      operation.updatedAt = now;
      operation.lastError = undefined;
    });
  }

  markFailed(operation: PendingUserOperation, error: string, now: Date) {
    this.write(() => {
      operation.syncStatus = UserDataSyncStatus.Failed;
      operation.lastError = error;
      operation.updatedAt = now;
    });
  }

  markBlocked(operation: PendingUserOperation, error: string, now: Date) {
    this.write(() => {
      operation.syncStatus = UserDataSyncStatus.Blocked;
      operation.lastError = error;
      operation.updatedAt = now;
    });
  }

  private write<T>(callback: () => T): T {
    return this.realm.isInTransaction ? callback() : this.realm.write(callback);
  }
}

export class UserLibraryPlaylistOperationReplayService {
  private readonly repository: UserLibraryPendingPlaylistOperationRepository;

  constructor(
    private readonly realm: Realm,
    private readonly client: RelistenUserLibraryApiClient,
    repository?: UserLibraryPendingPlaylistOperationRepository
  ) {
    this.repository = repository ?? new UserLibraryPendingPlaylistOperationRepository(realm);
  }

  async replayPending(
    scopeId: string,
    options: ReplayPlaylistOperationsOptions = {}
  ): Promise<ReplayPlaylistOperationsResult> {
    if (activeReplayScopes.has(scopeId)) {
      return emptyReplayResult({ alreadyRunning: true });
    }

    activeReplayScopes.add(scopeId);
    try {
      return await this.replayPendingUnlocked(scopeId, options);
    } finally {
      activeReplayScopes.delete(scopeId);
    }
  }

  private async replayPendingUnlocked(
    scopeId: string,
    options: ReplayPlaylistOperationsOptions
  ): Promise<ReplayPlaylistOperationsResult> {
    const results: ReplayPlaylistOperationResult[] = [];
    const blockedPlaylistUuids = new Set<string>();
    const operations = this.repository.listReplayable(scopeId);
    const maxOperations = options.maxOperations ?? operations.length;
    let attempted = 0;

    for (const operation of operations) {
      const playlistUuid = operation.entityUuid;

      if (attempted >= maxOperations) {
        break;
      }

      if (!playlistUuid || blockedPlaylistUuids.has(playlistUuid)) {
        results.push({
          operationUuid: operation.uuid,
          playlistUuid,
          status: 'skipped',
        });
        continue;
      }

      if (!shouldContinue(options)) {
        break;
      }

      attempted += 1;
      const attemptedAt = options.now ?? new Date();
      this.repository.markSyncing(operation, attemptedAt);

      try {
        const request = parsePendingPlaylistOperation(operation);
        const response = await postUserLibraryPlaylistOperation(
          this.client,
          playlistUuid,
          request,
          options.accessToken ? { accessToken: options.accessToken } : undefined
        );
        const reconciledAt = options.now ?? new Date();

        if (!shouldContinue(options)) {
          this.repository.markFailed(operation, 'stale_scope', reconciledAt);
          blockedPlaylistUuids.add(playlistUuid);
          results.push({
            operationUuid: operation.uuid,
            playlistUuid,
            status: 'failed',
            error: 'stale_scope',
          });
          break;
        }

        this.write(() => {
          applyUserLibraryPlaylistSnapshot(this.realm, scopeId, {
            playlist: response.playlist,
            updated_at: reconciledAt.toISOString(),
          });
          this.repository.markSynced(operation, reconciledAt);
        });

        results.push({
          operationUuid: operation.uuid,
          playlistUuid,
          status: 'synced',
          resultStatus: response.result_status,
        });
      } catch (error) {
        const failedAt = options.now ?? new Date();
        const errorMessage = safeUserLibraryErrorMessage(error);
        if (isTerminalPlaylistOperationError(error)) {
          this.repository.markBlocked(operation, errorMessage, failedAt);
        } else {
          this.repository.markFailed(operation, errorMessage, failedAt);
        }
        blockedPlaylistUuids.add(playlistUuid);
        results.push({
          operationUuid: operation.uuid,
          playlistUuid,
          status: 'failed',
          error: errorMessage,
        });

        if (options.throwAuthenticationErrors && isUnauthorizedApiError(error)) {
          throw error;
        }
      }
    }

    return {
      attempted,
      succeeded: results.filter((result) => result.status === 'synced').length,
      failed: results.filter((result) => result.status === 'failed').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      alreadyRunning: false,
      results,
    };
  }

  private write<T>(callback: () => T): T {
    return this.realm.isInTransaction ? callback() : this.realm.write(callback);
  }
}

function assertPlaylistOperationEnvelope(
  playlistUuid: string,
  operation: UserLibraryPlaylistOperationRequest
) {
  if (!playlistUuid) {
    throw new UserLibraryPlaylistOperationOutboxError('missing_playlist_uuid');
  }
  assertGuid('playlist_uuid', playlistUuid);

  if (!operation.idempotency_key) {
    throw new UserLibraryPlaylistOperationOutboxError('missing_idempotency_key');
  }
  assertGuid('idempotency_key', operation.idempotency_key);

  assertSupportedPlaylistOperation(operation);
  assertOptionalGuid('entry_uuid', operation.entry_uuid);
  assertOptionalGuid('source_track_uuid', operation.source_track_uuid);
  assertOptionalGuid('source_uuid', operation.source_uuid);
  assertOptionalGuid('block_uuid', operation.block_uuid);
  assertGuidArray('entry_uuids', operation.entry_uuids);
  assertGuidArray('source_track_uuids', operation.source_track_uuids);
  assertOptionalGuid('placement.after_entry_uuid', operation.placement?.after_entry_uuid);
  assertOptionalGuid('placement.before_entry_uuid', operation.placement?.before_entry_uuid);
  assertOptionalGuid('placement.target_block_uuid', operation.placement?.target_block_uuid);
}

function assertSupportedPlaylistOperation(operation: UserLibraryPlaylistOperationRequest) {
  if (!Object.values(UserLibraryPlaylistOperationType).includes(operation.op)) {
    throw new UserLibraryPlaylistOperationOutboxError('unsupported_playlist_operation');
  }
}

function assertSamePendingOperation(
  existing: PendingUserOperation,
  playlistUuid: string,
  operationJson: string
) {
  if (existing.entityUuid !== playlistUuid || existing.operationJson !== operationJson) {
    throw new UserLibraryPlaylistOperationOutboxError('idempotency_key_conflict');
  }
}

function isReplayableStatus(status: string) {
  return (
    status === UserDataSyncStatus.Pending ||
    status === UserDataSyncStatus.Syncing ||
    status === UserDataSyncStatus.Failed
  );
}

function comparePendingOperations(a: PendingUserOperation, b: PendingUserOperation) {
  const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();
  return timeDiff === 0 ? a.uuid.localeCompare(b.uuid) : timeDiff;
}

function assertGuid(label: string, value: string) {
  if (!GUID_PATTERN.test(value) || value.toLowerCase() === EMPTY_UUID) {
    throw new UserLibraryPlaylistOperationOutboxError(`invalid_${label}`);
  }
}

function assertOptionalGuid(label: string, value?: string | null) {
  if (value !== undefined && value !== null) {
    assertGuid(label, value);
  }
}

function assertGuidArray(label: string, values?: string[]) {
  for (const value of values ?? []) {
    assertGuid(label, value);
  }
}

function isTerminalPlaylistOperationError(error: unknown) {
  return (
    error instanceof UserLibraryPlaylistOperationOutboxError ||
    (error instanceof UserLibraryApiError &&
      TERMINAL_PLAYLIST_OPERATION_API_STATUSES.has(error.status))
  );
}

const TERMINAL_PLAYLIST_OPERATION_API_STATUSES = new Set([400, 403, 404, 422]);

function isUnauthorizedApiError(error: unknown) {
  return error instanceof UserLibraryApiError && error.status === 401;
}

function shouldContinue(options: ReplayPlaylistOperationsOptions) {
  return options.shouldContinue ? options.shouldContinue() : true;
}

function emptyReplayResult(
  overrides: Partial<ReplayPlaylistOperationsResult> = {}
): ReplayPlaylistOperationsResult {
  return {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    alreadyRunning: false,
    results: [],
    ...overrides,
  };
}

function normalizeJsonValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entryValue]) => [key, normalizeJsonValue(entryValue)])
  );
}
