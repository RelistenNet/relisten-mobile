import Realm from 'realm';

import { CatalogV4Transport } from '@/relisten/api/v4/catalog_transport';
import { CatalogQueryState } from '@/relisten/realm/models/v4_catalog';
import { log } from '@/relisten/util/logging';

const logger = log.extend('v4-catalog');

export const V4_CATALOG_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

interface CatalogV4RefreshRequest<T> {
  queryKey: string;
  path: string;
  force: boolean;
  hasLocalData: () => boolean;
  apply: (data: T) => string[];
}

interface CatalogV4CoordinatorOptions {
  now?: () => Date;
}

/**
 * Owns v4 conditional-read state and the transaction that couples an applied
 * payload to its validator. Endpoint-specific ownership remains in the apply
 * functions passed by the explicit catalog client methods.
 */
export class CatalogV4Coordinator {
  private readonly queryGenerations = new Map<string, number>();
  private readonly inflightRequests = new Map<string, Promise<void>>();
  private readonly pendingRetries = new Map<string, () => Promise<void>>();
  private readonly now: () => Date;

  constructor(
    private readonly realm: Realm,
    private readonly transport: CatalogV4Transport,
    options: CatalogV4CoordinatorOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async refresh<T>(request: CatalogV4RefreshRequest<T>): Promise<void> {
    const state = this.realm.objectForPrimaryKey(CatalogQueryState, request.queryKey);
    if (!request.force && this.isFresh(state, request.hasLocalData)) {
      return;
    }

    const existing = this.inflightRequests.get(request.queryKey);
    if (!request.force && existing) {
      return existing;
    }

    const queryGeneration = (this.queryGenerations.get(request.queryKey) ?? 0) + 1;
    this.queryGenerations.set(request.queryKey, queryGeneration);

    const promise = this.performRefresh(request, queryGeneration).finally(() => {
      if (this.inflightRequests.get(request.queryKey) === promise) {
        this.inflightRequests.delete(request.queryKey);
      }
    });
    this.inflightRequests.set(request.queryKey, promise);

    return promise;
  }

  async onNetworkAvailable() {
    const retries = [...this.pendingRetries.values()];
    await Promise.allSettled(retries.map((retry) => retry()));
  }

  private async performRefresh<T>(
    request: CatalogV4RefreshRequest<T>,
    queryGeneration: number
  ): Promise<void> {
    try {
      const state = this.realm.objectForPrimaryKey(CatalogQueryState, request.queryKey);
      const appliedEtag =
        state?.hasAppliedData && state.etag && request.hasLocalData() ? state.etag : undefined;

      let response = await this.transport.getJson<T>(request.path, appliedEtag);
      if (!this.isQueryCurrent(request.queryKey, queryGeneration)) return;

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
            currentState.lastCheckedAt = this.now();
            currentState.retryPending = false;
          });
          this.pendingRetries.delete(request.queryKey);
          return;
        }

        response = await this.transport.getJson<T>(request.path);
        if (!this.isQueryCurrent(request.queryKey, queryGeneration)) return;
        if (response.status === 'not_modified') {
          throw new Error('The v4 catalog returned 304 without a usable applied validator.');
        }
      }

      const applyStartedAt = performance.now();
      const appliedAt = this.now();
      this.realm.write(() => {
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
      const applyMilliseconds = performance.now() - applyStartedAt;
      const networkMilliseconds =
        response.metrics.totalMilliseconds - response.metrics.parseMilliseconds;
      this.pendingRetries.delete(request.queryKey);
      logger.info(
        `${request.queryKey} download_ms=${response.metrics.downloadMilliseconds.toFixed(1)} parse_ms=${response.metrics.parseMilliseconds.toFixed(1)} apply_ms=${applyMilliseconds.toFixed(1)} network_ms=${networkMilliseconds.toFixed(1)}`
      );
    } catch (error) {
      if (!this.isQueryCurrent(request.queryKey, queryGeneration)) return;

      this.markRetryPending(request.queryKey);
      this.pendingRetries.set(request.queryKey, () => this.refresh({ ...request, force: false }));
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

  private isQueryCurrent(queryKey: string, queryGeneration: number) {
    return queryGeneration === this.queryGenerations.get(queryKey);
  }
}
