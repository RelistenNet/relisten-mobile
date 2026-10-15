import { FavoriteMutation, FavoriteMutationState } from '@/relisten/realm/models/library';
import {
  FavoriteAccountScopeCapture,
  FavoriteRepository,
  FavoriteTarget,
  StaleFavoriteAccountScopeError,
  write,
} from '@/relisten/library/favorite_repository';
import { FavoriteRemoteLibraryApplier } from '@/relisten/library/favorite_remote_library_applier';
import {
  favoriteSyncFailure,
  FavoriteSyncFailure,
  sendFavoriteMutationBatchWithIsolation,
} from '@/relisten/library/favorite_mutation_batch_isolation';
import {
  FavoriteLibraryChanges,
  FavoriteLibrarySnapshot,
  FavoriteMutationBatchRequest,
  FavoriteMutationBatchResponse,
  FavoriteMutationRequestItem,
} from '@/relisten/library/favorite_sync_contract';

export interface FavoriteMutationTransport {
  sendFavoriteMutations(
    request: FavoriteMutationBatchRequest
  ): Promise<FavoriteMutationBatchResponse>;
}

export interface PreparedFavoriteMutationBatch {
  capture: FavoriteAccountScopeCapture;
  mutationUuids: string[];
  request: FavoriteMutationBatchRequest;
}

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;
const RETRY_DELAY_MS = 30_000;

/**
 * Owns durable outbox state transitions. Applying validated remote membership
 * is delegated so request retry policy and catalog reconciliation stay separate.
 */
export class FavoriteSyncAdapter {
  private readonly remoteLibrary: FavoriteRemoteLibraryApplier;

  constructor(private readonly repository: FavoriteRepository) {
    this.remoteLibrary = new FavoriteRemoteLibraryApplier(repository);
  }

  async syncNextBatch(
    transport: FavoriteMutationTransport,
    capture = this.repository.captureScope()
  ) {
    const prepared = this.prepareMutationBatch(capture);
    if (!prepared) {
      return false;
    }

    try {
      await sendFavoriteMutationBatchWithIsolation({
        request: prepared.request,
        send: (request) => transport.sendFavoriteMutations(request),
        apply: (request, response) =>
          this.remoteLibrary.applyMutationResponse(prepared.capture, request, response),
        reject: (mutationUuids, failure) =>
          this.rejectMutationBatch(prepared.capture, mutationUuids, failure),
      });
      return true;
    } catch (error) {
      if (this.repository.isCaptureCurrent(prepared.capture)) {
        const failure = favoriteSyncFailure(error);
        // Known mutation-semantic failures are isolated inside the batch sender.
        // Anything reaching this catch must remain retryable as one durable batch.
        this.releaseMutationBatch(
          prepared.capture,
          prepared.mutationUuids,
          failure,
          new Date(Date.now() + RETRY_DELAY_MS)
        );
      }
      throw error;
    }
  }

  prepareMutationBatch(
    capture = this.repository.captureScope(),
    requestedLimit = DEFAULT_BATCH_SIZE,
    now = new Date()
  ): PreparedFavoriteMutationBatch | undefined {
    this.assertCurrent(capture);
    const limit = Math.max(1, Math.min(requestedLimit, MAX_BATCH_SIZE));
    const realm = this.repository.realm;

    return write(realm, () => {
      this.assertCurrent(capture);
      const blockedTargets = new Set(
        realm
          .objects(FavoriteMutation)
          .filtered(
            'scopeId == $0 AND state == $1',
            capture.scopeId,
            FavoriteMutationState.InFlight
          )
          .map(targetKey)
      );
      const pending = [
        ...realm
          .objects(FavoriteMutation)
          .filtered('scopeId == $0 AND state == $1', capture.scopeId, FavoriteMutationState.Pending)
          .sorted('localSequence'),
      ];
      const selected: FavoriteMutation[] = [];

      for (const mutation of pending) {
        const key = targetKey(mutation);
        if (
          selected.length >= limit ||
          blockedTargets.has(key) ||
          (mutation.nextAttemptAt && mutation.nextAttemptAt > now)
        ) {
          continue;
        }

        blockedTargets.add(key);
        mutation.state = FavoriteMutationState.InFlight;
        mutation.requestStartedAt = now;
        mutation.attemptCount += 1;
        mutation.updatedAt = now;
        selected.push(mutation);
      }

      if (selected.length === 0) {
        return undefined;
      }

      return {
        capture,
        mutationUuids: selected.map((mutation) => mutation.mutationUuid),
        request: {
          contract_version: 1,
          mutations: selected.map(toRequestItem),
        },
      };
    });
  }

  releaseMutationBatch(
    capture: FavoriteAccountScopeCapture,
    mutationUuids: ReadonlyArray<string>,
    failure: FavoriteSyncFailure,
    nextAttemptAt: Date,
    now = new Date()
  ) {
    this.updateMutationBatch(capture, mutationUuids, FavoriteMutationState.InFlight, (mutation) => {
      mutation.state = FavoriteMutationState.Pending;
      mutation.nextAttemptAt = nextAttemptAt;
      mutation.lastErrorCode = failure.code;
      mutation.lastErrorMessage = failure.message;
      mutation.updatedAt = now;
    });
  }

  rejectMutationBatch(
    capture: FavoriteAccountScopeCapture,
    mutationUuids: ReadonlyArray<string>,
    failure: FavoriteSyncFailure,
    now = new Date()
  ) {
    this.updateMutationBatch(capture, mutationUuids, FavoriteMutationState.InFlight, (mutation) => {
      mutation.state = FavoriteMutationState.NeedsAttention;
      mutation.nextAttemptAt = undefined;
      mutation.lastErrorCode = failure.code;
      mutation.lastErrorMessage = failure.message;
      mutation.updatedAt = now;
    });
  }

  applySnapshot(
    capture: FavoriteAccountScopeCapture,
    snapshot: FavoriteLibrarySnapshot,
    now = new Date()
  ) {
    this.remoteLibrary.applySnapshot(capture, snapshot, now);
  }

  applyChanges(
    capture: FavoriteAccountScopeCapture,
    page: FavoriteLibraryChanges,
    now = new Date()
  ) {
    this.remoteLibrary.applyChanges(capture, page, now);
  }

  private updateMutationBatch(
    capture: FavoriteAccountScopeCapture,
    mutationUuids: ReadonlyArray<string>,
    expectedState: FavoriteMutationState,
    update: (mutation: FavoriteMutation) => void
  ) {
    this.assertCurrent(capture);
    const realm = this.repository.realm;

    write(realm, () => {
      this.assertCurrent(capture);
      for (const mutationUuid of mutationUuids) {
        const mutation = realm.objectForPrimaryKey(FavoriteMutation, mutationUuid);
        if (!mutation || mutation.scopeId !== capture.scopeId || mutation.state !== expectedState) {
          continue;
        }

        mutation.requestStartedAt = undefined;
        update(mutation);
      }
    });
  }

  private assertCurrent(capture: FavoriteAccountScopeCapture) {
    if (!this.repository.isCaptureCurrent(capture)) {
      throw new StaleFavoriteAccountScopeError();
    }
  }
}

function toRequestItem(mutation: FavoriteMutation): FavoriteMutationRequestItem {
  const common = {
    mutation_uuid: mutation.mutationUuid,
    catalog_type: mutation.catalogType,
    catalog_uuid: mutation.catalogUuid,
  };

  return mutation.desiredPresent
    ? {
        ...common,
        desired_state: 'favorite',
        favorite_uuid: mutation.favoriteUuid,
      }
    : {
        ...common,
        desired_state: 'not_favorite',
      };
}

function targetKey(target: FavoriteTarget) {
  return `${target.catalogType}:${target.catalogUuid}`;
}
