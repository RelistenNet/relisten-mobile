import Realm from 'realm';

import type {
  AccountScopeCapture,
  AccountScopeSource,
} from '@/relisten/accounts/account_scope_store';
import {
  CatalogV4Transport,
  type CatalogV4RequestMetrics,
} from '@/relisten/api/v4/catalog_transport';
import { CatalogQueryState } from '@/relisten/realm/models/v4_catalog';
import { log } from '@/relisten/util/logging';

const logger = log.extend('v4-catalog');

export const V4_CATALOG_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export type CatalogV4RefreshStatus = 'applied' | 'not_modified' | 'fresh' | 'discarded';

export interface CatalogV4RefreshResult {
  status: CatalogV4RefreshStatus;
  metrics?: CatalogV4RequestMetrics;
  applyMilliseconds?: number;
}

interface CatalogV4RefreshRequest<T> {
  queryKey: string;
  path: string;
  force: boolean;
  hasLocalData: () => boolean;
  apply: (data: T) => string[];
  retry: () => Promise<CatalogV4RefreshResult>;
}

interface RequestFence {
  queryGeneration: number;
  transportGeneration: number;
  accountCapture?: AccountScopeCapture;
}

interface InflightRequest {
  fence: RequestFence;
  promise: Promise<CatalogV4RefreshResult>;
}

class StaleCatalogRequestError extends Error {
  constructor() {
    super('A newer catalog request or client generation superseded this response.');
    this.name = 'StaleCatalogRequestError';
  }
}

export interface CatalogV4CoordinatorOptions {
  accountScope?: AccountScopeSource;
  now?: () => Date;
  nowMilliseconds?: () => number;
}

/**
 * Owns v4 conditional-read state and the transaction that couples an applied
 * payload to its validator. Endpoint-specific ownership remains in the apply
 * functions passed by the explicit catalog client methods.
 */
export class CatalogV4Coordinator {
  private transportGeneration = 0;
  private readonly queryGenerations = new Map<string, number>();
  private readonly inflightRequests = new Map<string, InflightRequest>();
  private readonly pendingRetries = new Map<string, () => Promise<CatalogV4RefreshResult>>();
  private readonly accountScope?: AccountScopeSource;
  private readonly now: () => Date;
  private readonly nowMilliseconds: () => number;

  constructor(
    private readonly realm: Realm,
    private transport: CatalogV4Transport,
    options: CatalogV4CoordinatorOptions = {}
  ) {
    this.accountScope = options.accountScope;
    this.now = options.now ?? (() => new Date());
    this.nowMilliseconds = options.nowMilliseconds ?? (() => performance.now());
  }

  replaceTransport(transport: CatalogV4Transport) {
    if (transport === this.transport) return;

    this.transport = transport;
    this.transportGeneration += 1;
    this.inflightRequests.clear();
    this.pendingRetries.clear();
    this.realm.write(() => {
      for (const state of this.realm.objects(CatalogQueryState)) {
        state.etag = undefined;
        state.lastCheckedAt = undefined;
      }
    });
  }

  async refresh<T>(request: CatalogV4RefreshRequest<T>): Promise<CatalogV4RefreshResult> {
    const state = this.realm.objectForPrimaryKey(CatalogQueryState, request.queryKey);
    if (!request.force && this.isFresh(state, request.hasLocalData)) {
      return { status: 'fresh' };
    }

    const existing = this.inflightRequests.get(request.queryKey);
    if (!request.force && existing && this.isFenceCurrent(request.queryKey, existing.fence)) {
      return existing.promise;
    }

    const fence: RequestFence = {
      queryGeneration: (this.queryGenerations.get(request.queryKey) ?? 0) + 1,
      transportGeneration: this.transportGeneration,
      accountCapture: this.accountScope?.capture(),
    };
    this.queryGenerations.set(request.queryKey, fence.queryGeneration);

    const promise = this.performRefresh(request, fence).finally(() => {
      if (this.inflightRequests.get(request.queryKey)?.promise === promise) {
        this.inflightRequests.delete(request.queryKey);
      }
    });
    this.inflightRequests.set(request.queryKey, { fence, promise });

    return promise;
  }

  async onNetworkAvailable() {
    const retries = [...this.pendingRetries.values()];
    await Promise.allSettled(retries.map((retry) => retry()));
  }

  private async performRefresh<T>(
    request: CatalogV4RefreshRequest<T>,
    fence: RequestFence
  ): Promise<CatalogV4RefreshResult> {
    try {
      const state = this.realm.objectForPrimaryKey(CatalogQueryState, request.queryKey);
      const appliedEtag =
        state?.hasAppliedData && state.etag && request.hasLocalData() ? state.etag : undefined;

      let response = await this.transport.getJson<T>(request.path, appliedEtag);
      this.assertFenceCurrent(request.queryKey, fence);

      if (response.status === 'not_modified') {
        const currentState = this.realm.objectForPrimaryKey(CatalogQueryState, request.queryKey);
        const canUse304 =
          appliedEtag !== undefined &&
          response.etag === appliedEtag &&
          currentState?.etag === appliedEtag &&
          currentState.hasAppliedData &&
          request.hasLocalData();

        if (canUse304) {
          this.realm.write(() => {
            this.assertFenceCurrent(request.queryKey, fence);
            const stateToCheck = this.realm.objectForPrimaryKey(
              CatalogQueryState,
              request.queryKey
            );
            if (
              stateToCheck?.etag !== appliedEtag ||
              !stateToCheck.hasAppliedData ||
              !request.hasLocalData()
            ) {
              throw new StaleCatalogRequestError();
            }
            stateToCheck.lastCheckedAt = this.now();
            stateToCheck.retryPending = false;
          });
          this.pendingRetries.delete(request.queryKey);
          return { status: 'not_modified', metrics: response.metrics };
        }

        response = await this.transport.getJson<T>(request.path);
        this.assertFenceCurrent(request.queryKey, fence);
        if (response.status === 'not_modified') {
          throw new Error('The v4 catalog returned 304 without a usable applied validator.');
        }
      }

      const applyStartedAt = this.nowMilliseconds();
      const appliedAt = this.now();
      this.realm.write(() => {
        this.assertFenceCurrent(request.queryKey, fence);
        const resultIds = request.apply(response.data);
        const queryState = this.realm.objectForPrimaryKey(CatalogQueryState, request.queryKey);

        if (queryState) {
          queryState.etag = response.etag;
          queryState.hasAppliedData = true;
          queryState.lastAppliedAt = appliedAt;
          queryState.lastCheckedAt = appliedAt;
          queryState.retryPending = false;
          queryState.resultIds.splice(0, queryState.resultIds.length, ...resultIds);
        } else {
          this.realm.create(CatalogQueryState, {
            key: request.queryKey,
            etag: response.etag,
            hasAppliedData: true,
            lastAppliedAt: appliedAt,
            lastCheckedAt: appliedAt,
            retryPending: false,
            resultIds,
          });
        }
      });
      const applyMilliseconds = this.nowMilliseconds() - applyStartedAt;
      const networkMilliseconds =
        response.metrics.totalMilliseconds - response.metrics.parseMilliseconds;
      this.pendingRetries.delete(request.queryKey);
      logger.info(
        `${request.queryKey} bytes=${response.metrics.bodyBytes} download_ms=${response.metrics.downloadMilliseconds.toFixed(1)} parse_ms=${response.metrics.parseMilliseconds.toFixed(1)} apply_ms=${applyMilliseconds.toFixed(1)} network_ms=${networkMilliseconds.toFixed(1)}`
      );

      return { status: 'applied', metrics: response.metrics, applyMilliseconds };
    } catch (error) {
      if (!this.isQueryAndTransportFenceCurrent(request.queryKey, fence)) {
        return { status: 'discarded' };
      }

      if (!this.isAccountFenceCurrent(fence)) {
        this.scheduleAccountScopeRetry(request.queryKey, request.retry);
        return { status: 'discarded' };
      }

      if (error instanceof StaleCatalogRequestError) {
        return { status: 'discarded' };
      }

      this.markRetryPending(request.queryKey);
      this.pendingRetries.set(request.queryKey, request.retry);
      throw error;
    }
  }

  private isFresh(state: CatalogQueryState | null, hasLocalData: () => boolean) {
    if (!state?.hasAppliedData || state.retryPending || !state.lastCheckedAt || !hasLocalData()) {
      return false;
    }

    return this.now().getTime() - state.lastCheckedAt.getTime() < V4_CATALOG_REFRESH_INTERVAL_MS;
  }

  private markRetryPending(queryKey: string) {
    this.realm.write(() => {
      const state = this.realm.objectForPrimaryKey(CatalogQueryState, queryKey);
      if (state) {
        state.retryPending = true;
      } else {
        this.realm.create(CatalogQueryState, {
          key: queryKey,
          hasAppliedData: false,
          retryPending: true,
          resultIds: [],
        });
      }
    });
  }

  private isFenceCurrent(queryKey: string, fence: RequestFence) {
    return (
      this.isQueryAndTransportFenceCurrent(queryKey, fence) && this.isAccountFenceCurrent(fence)
    );
  }

  private isQueryAndTransportFenceCurrent(queryKey: string, fence: RequestFence) {
    return (
      fence.queryGeneration === this.queryGenerations.get(queryKey) &&
      fence.transportGeneration === this.transportGeneration
    );
  }

  private isAccountFenceCurrent(fence: RequestFence) {
    return !fence.accountCapture || this.accountScope?.isCurrent(fence.accountCapture) === true;
  }

  private scheduleAccountScopeRetry(
    queryKey: string,
    retry: () => Promise<CatalogV4RefreshResult>
  ) {
    this.pendingRetries.set(queryKey, retry);
    setTimeout(() => {
      if (this.pendingRetries.get(queryKey) !== retry) return;

      this.pendingRetries.delete(queryKey);
      void retry().catch((error) => {
        logger.warn(`Account-scoped catalog retry failed for ${queryKey}: ${String(error)}`);
      });
    }, 0);
  }

  private assertFenceCurrent(queryKey: string, fence: RequestFence) {
    if (!this.isFenceCurrent(queryKey, fence)) {
      throw new StaleCatalogRequestError();
    }
  }
}
