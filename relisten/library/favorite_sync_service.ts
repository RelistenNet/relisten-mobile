import {
  AccountsApiError,
  AuthorizedAccountsApiClient,
} from '@/relisten/accounts/api/accounts_api_client';
import { AccountScopeSnapshot, StaleAccountScopeError } from '@/relisten/accounts/account_context';
import {
  FavoriteAccountScopeCapture,
  FavoriteRepository,
  StaleFavoriteAccountScopeError,
} from '@/relisten/library/favorite_repository';
import { FavoriteMetadataHydrator } from '@/relisten/library/favorite_metadata_hydrator';
import { earliestFutureRetryAt } from '@/relisten/library/favorite_retry_schedule';
import {
  FavoriteMetadataHydrationError,
  favoriteSyncFailure,
} from '@/relisten/library/favorite_sync_failure';
import { FavoriteSyncRunStateStore } from '@/relisten/library/favorite_sync_run_state_store';
import {
  FavoriteMutationTransport,
  FavoriteSyncAdapter,
} from '@/relisten/library/favorite_sync_adapter';
import {
  FavoriteLibraryChanges,
  FavoriteLibrarySnapshot,
  FavoriteMutationBatchRequest,
  FavoriteMutationBatchResponse,
} from '@/relisten/library/favorite_sync_contract';
import {
  FavoriteMetadataStatus,
  FavoriteMutation,
  FavoriteMutationState,
  FavoriteSyncRunStatus,
  UserFavorite,
} from '@/relisten/realm/models/library';
import { log } from '@/relisten/util/logging';

const logger = log.extend('favorite-sync');
const RETRY_DELAY_MS = 30_000;

export interface FavoriteSyncEnvironment {
  account: AccountScopeSnapshot;
  appIsActive: boolean;
  canMakeNetworkRequests: boolean;
}

const INITIAL_ENVIRONMENT: FavoriteSyncEnvironment = {
  account: {
    scopeId: 'anonymous',
    userUuid: null,
    generation: 0,
    nativeSessionId: null,
    isAuthenticated: false,
  },
  appIsActive: false,
  canMakeNetworkRequests: false,
};

/**
 * Serializes the favorites pull-push-pull loop independently of React renders.
 * The durable outbox and retry deadline survive a Strict Mode effect restart;
 * captured account generations fence every response write in the adapter.
 */
export class FavoriteSyncService {
  private readonly mutations;
  private environment = INITIAL_ENVIRONMENT;
  private started = false;
  private running = false;
  private rerunRequested = false;
  private retryAt: number | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly runState: FavoriteSyncRunStateStore;

  constructor(
    private readonly repository: FavoriteRepository,
    private readonly adapter: FavoriteSyncAdapter,
    private readonly accountsApi: AuthorizedAccountsApiClient,
    private readonly metadataHydrator: FavoriteMetadataHydrator
  ) {
    this.mutations = repository.realm.objects(FavoriteMutation);
    this.runState = new FavoriteSyncRunStateStore(repository);
  }

  start = () => {
    if (this.started) {
      return;
    }

    this.started = true;
    this.mutations.addListener(this.handleOutboxChanged);
    this.requestRun();
  };

  stop = () => {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.mutations.removeListener(this.handleOutboxChanged);
    this.clearRetryTimer();
  };

  updateEnvironment(environment: FavoriteSyncEnvironment) {
    const accountChanged =
      environment.account.scopeId !== this.environment.account.scopeId ||
      environment.account.generation !== this.environment.account.generation;
    const becameRunnable = !this.canRun(this.environment) && this.canRun(environment);
    this.environment = environment;

    if (accountChanged || becameRunnable) {
      this.retryAt = undefined;
      this.clearRetryTimer();
    }
    if (accountChanged && environment.account.isAuthenticated) {
      this.runState.markInitialWaiting(environment.account);
    }
    this.requestRun();
  }

  retryNow() {
    this.retryAt = undefined;
    this.clearRetryTimer();
    if (this.environment.account.isAuthenticated) {
      this.runState.update(this.environment.account, FavoriteSyncRunStatus.Waiting);
    }
    this.requestRun();
  }

  private readonly handleOutboxChanged = () => {
    this.requestRun();
  };

  private requestRun() {
    if (!this.started || !this.canRun(this.environment)) {
      return;
    }
    if (this.retryAt && this.retryAt > Date.now()) {
      this.scheduleRetryTimer();
      return;
    }
    if (this.running) {
      this.rerunRequested = true;
      return;
    }

    void this.run();
  }

  private async run() {
    this.running = true;
    let activeCapture: FavoriteAccountScopeCapture | null = null;
    let retryableFailure = false;
    try {
      do {
        this.rerunRequested = false;
        const capture = this.repository.captureScope();
        activeCapture = capture;
        if (!this.captureMatchesEnvironment(capture)) {
          return;
        }

        this.runState.update(capture, FavoriteSyncRunStatus.Syncing);
        // Switching away can strand an in-flight operation because its response
        // is correctly fenced. Reset only the newly active generation's rows.
        this.repository.resetInterruptedMutations(capture);
        await this.pullLibrary(capture);
        while (
          this.captureMatchesEnvironment(capture) &&
          (await this.adapter.syncNextBatch(this.transport, capture))
        ) {
          // Keep draining bounded batches while this generation remains current.
        }
        if (!this.captureMatchesEnvironment(capture)) {
          return;
        }
        await this.pullLibrary(capture);
        await this.hydrateMetadata(capture);
        this.runState.update(capture, FavoriteSyncRunStatus.Saved);
        this.retryAt = this.nextPersistedRetryAt(capture.scopeId);
        this.scheduleRetryTimer();
      } while (this.rerunRequested && this.canRun(this.environment));
    } catch (error) {
      logger.warn(`favorite sync paused: ${errorName(error)}`);
      const staleScope = isStaleScopeError(error);
      if (activeCapture && !staleScope) {
        const hasLocalSnapshot = !!this.runState.current(activeCapture.scopeId)
          ?.lastSuccessfulSyncAt;
        const failure = favoriteSyncFailure(error, hasLocalSnapshot);
        retryableFailure = failure.retryable;
        this.runState.update(
          activeCapture,
          FavoriteSyncRunStatus.NeedsAttention,
          failure.code,
          failure.message,
          failure.retryable
        );
      }
      // A scope switch already requested a fresh run for the new account. Do
      // not let that account's future mutation deadline delay its initial pull.
      const persistedRetryAt = staleScope
        ? undefined
        : this.nextPersistedRetryAt(this.environment.account.scopeId);
      if (retryableFailure) {
        this.retryAt = persistedRetryAt ?? Date.now() + RETRY_DELAY_MS;
        this.scheduleRetryTimer();
      }
    } finally {
      this.running = false;
      if (this.rerunRequested) {
        this.requestRun();
      }
    }
  }

  private async pullLibrary(capture: FavoriteAccountScopeCapture) {
    let syncState = this.runState.current(capture.scopeId);

    if (!syncState?.libraryCursor) {
      const snapshot =
        await this.accountsApi.request<FavoriteLibrarySnapshot>('/v1/library/snapshot');
      this.adapter.applySnapshot(capture, snapshot);
      syncState = this.runState.current(capture.scopeId);
    }

    while (syncState?.libraryCursor) {
      const requestedCursor = syncState.libraryCursor;
      let page: FavoriteLibraryChanges;
      try {
        page = await this.accountsApi.request<FavoriteLibraryChanges>(
          `/v1/library/changes?after=${encodeURIComponent(requestedCursor)}`
        );
      } catch (error) {
        if (isExpiredCursor(error)) {
          const snapshot =
            await this.accountsApi.request<FavoriteLibrarySnapshot>('/v1/library/snapshot');
          this.adapter.applySnapshot(capture, snapshot);
          return;
        }
        throw error;
      }

      this.adapter.applyChanges(capture, page);
      if (!page.has_more) {
        return;
      }
      if (page.next_cursor === requestedCursor) {
        throw new Error('A paged favorite response did not advance its cursor.');
      }
      syncState = this.runState.current(capture.scopeId);
    }
  }

  private async hydrateMetadata(capture: FavoriteAccountScopeCapture) {
    await this.metadataHydrator.hydrateMissing(capture);
    if (!this.repository.isCaptureCurrent(capture)) {
      throw new StaleFavoriteAccountScopeError();
    }

    const unresolvedCount = this.repository.realm
      .objects(UserFavorite)
      .filtered(
        'scopeId == $0 AND effectivePresent == true AND metadataStatus == $1',
        capture.scopeId,
        FavoriteMetadataStatus.Unknown
      ).length;
    if (unresolvedCount > 0) {
      throw new FavoriteMetadataHydrationError(unresolvedCount);
    }
  }

  private readonly transport: FavoriteMutationTransport = {
    sendFavoriteMutations: (request) =>
      this.accountsApi.request<FavoriteMutationBatchResponse>(
        '/v1/library/favorite-mutations:batch',
        jsonPost(request)
      ),
  };

  private nextPersistedRetryAt(scopeId: string) {
    const nextAttemptAts = this.repository.realm
      .objects(FavoriteMutation)
      .filtered(
        'scopeId == $0 AND state == $1 AND nextAttemptAt != nil',
        scopeId,
        FavoriteMutationState.Pending
      )
      .map((mutation) => mutation.nextAttemptAt);

    return earliestFutureRetryAt(nextAttemptAts);
  }

  private captureMatchesEnvironment(capture: FavoriteAccountScopeCapture) {
    return (
      this.canRun(this.environment) &&
      capture.scopeId === this.environment.account.scopeId &&
      capture.generation === this.environment.account.generation
    );
  }

  private canRun(environment: FavoriteSyncEnvironment) {
    return (
      environment.account.isAuthenticated &&
      environment.appIsActive &&
      environment.canMakeNetworkRequests
    );
  }

  private scheduleRetryTimer() {
    if (!this.started || !this.retryAt || this.retryTimer) {
      return;
    }

    this.retryTimer = setTimeout(
      () => {
        this.retryTimer = undefined;
        this.retryAt = undefined;
        this.requestRun();
      },
      Math.max(0, this.retryAt - Date.now())
    );
  }

  private clearRetryTimer() {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }
}

function jsonPost(body: FavoriteMutationBatchRequest): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function isExpiredCursor(error: unknown) {
  return (
    error instanceof AccountsApiError &&
    error.status === 410 &&
    error.code === 'sync_cursor_expired'
  );
}

function isStaleScopeError(error: unknown) {
  return error instanceof StaleAccountScopeError || error instanceof StaleFavoriteAccountScopeError;
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : 'unknown_error';
}
