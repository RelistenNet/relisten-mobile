import { NetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { EmittableValueStream, ValueStream } from '@/relisten/realm/value_streams';
import { log } from '@/relisten/util/logging';
import Realm from 'realm';
import {
  RelistenApiClient,
  RelistenApiClientError,
  RelistenApiResponse,
  RelistenApiResponseType,
} from '../api/client';
import { CatalogQueryState } from './models/v4_catalog';

export enum NetworkBackedBehaviorFetchStrategy {
  UNKNOWN,
  NetworkAlwaysFirst,
  StaleWhileRevalidate,
  LocalOnly,
  NetworkOnlyIfLocalIsNotShowable,
}

export abstract class NetworkBackedBehavior<TLocalData, TApiData> {
  readonly fetchStrategy: NetworkBackedBehaviorFetchStrategy;

  protected constructor(
    readonly realm: Realm,
    options?: NetworkBackedBehaviorOptions
  ) {
    this.fetchStrategy =
      options?.fetchStrategy ?? NetworkBackedBehaviorFetchStrategy.StaleWhileRevalidate;
  }

  get queryKey(): string | undefined {
    return undefined;
  }

  // Applied empty collections are valid. Repositories only check required roots/owners.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hasLocalData(_localData: TLocalData, _resultIds: Iterable<string>): boolean {
    return true;
  }

  abstract createLocalUpdatingResults(): ValueStream<TLocalData>;

  private _sharedExecutor: NetworkBackedBehaviorExecutor<TLocalData, TApiData> | undefined;

  sharedExecutor(api: RelistenApiClient) {
    if (!this._sharedExecutor) {
      this._sharedExecutor = new NetworkBackedBehaviorExecutor(this, api);
    }

    return this._sharedExecutor;
  }

  abstract fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean,
    etag?: string
  ): Promise<RelistenApiResponse<TApiData | undefined>>;

  abstract isLocalDataShowable(localData: TLocalData): boolean;

  abstract upsert(localData: TLocalData, apiData: TApiData): string[] | void;
}

export interface NetworkBackedBehaviorOptions {
  fetchStrategy?: NetworkBackedBehaviorFetchStrategy;
}

const logger = log.extend('NetworkBackedBehaviorExecutor');

export const defaultNetworkLoadingValue = (
  fetchStrategy: NetworkBackedBehaviorFetchStrategy,
  dataExists: boolean
) => {
  return fetchStrategy === NetworkBackedBehaviorFetchStrategy.NetworkAlwaysFirst || !dataExists;
};

export class NetworkBackedResultValueStream<TLocalData> extends EmittableValueStream<
  NetworkBackedResults<TLocalData>
> {
  firstMatch(
    matcher: (result: NetworkBackedResults<TLocalData>) => boolean
  ): Promise<NetworkBackedResults<TLocalData>> {
    return new Promise((resolve) => {
      const tearDown = this.addListener((newResults) => {
        if (matcher(newResults)) {
          setImmediate(() => tearDown());
          resolve(newResults);
        }
      });
    });
  }
}

export class NetworkBackedBehaviorExecutor<TLocalData, TApiData> {
  private isNetworkLoading: boolean;

  private isNetworkLoadingDefault: boolean;

  private errors: RelistenApiClientError[] | undefined = undefined;

  private localData: ValueStream<TLocalData>;

  private output: NetworkBackedResultValueStream<TLocalData>;

  constructor(
    private behavior: NetworkBackedBehavior<TLocalData, TApiData>,
    private api: RelistenApiClient
  ) {
    this.localData = this.behavior.createLocalUpdatingResults();

    const dataExists = this.behavior.isLocalDataShowable(this.localData.currentValue);
    this.isNetworkLoadingDefault = defaultNetworkLoadingValue(
      this.behavior.fetchStrategy,
      dataExists
    );

    this.isNetworkLoading = this.isNetworkLoadingDefault;

    this.output = new NetworkBackedResultValueStream<TLocalData>(this.buildResult());

    this.localData.addListener(() => {
      // If the local data changes, emit another output event
      this.buildAndEmit();
    });
  }

  currentResults(): NetworkBackedResults<TLocalData> {
    return this.output.currentValue;
  }

  start(): NetworkBackedResultValueStream<TLocalData> {
    this.refresh(false).catch((e) => {
      logger.error(e);

      if (__DEV__) {
        throw e;
      }
    });

    return this.output;
  }

  static async executeUntilMatches<TLocalData, TApiData>(
    behavior: NetworkBackedBehavior<TLocalData, TApiData>,
    api: RelistenApiClient,
    matcher: (results: NetworkBackedResults<TLocalData>) => boolean
  ): Promise<NetworkBackedResults<TLocalData>> {
    const executor = behavior.sharedExecutor(api);
    const result = await executor.start().firstMatch(matcher);

    executor.tearDown();

    return result;
  }

  static executeToFirstShowableData<TLocalData, TApiData>(
    behavior: NetworkBackedBehavior<TLocalData, TApiData>,
    api: RelistenApiClient
  ): Promise<NetworkBackedResults<TLocalData>> {
    return this.executeUntilMatches(behavior, api, (result) => {
      return behavior.isLocalDataShowable(result.data);
    });
  }

  public tearDown() {
    this.output.tearDown();
    this.localData.tearDown();
  }

  private buildResult(): NetworkBackedResults<TLocalData> {
    // It is important that all of these have stable values and only change identities
    // when there has been a semantic change for React compatiblity.
    return {
      isNetworkLoading: this.isNetworkLoading,
      data: this.localData.currentValue,
      refresh: this.refresh,
      errors: this.errors,
    };
  }

  private buildAndEmit() {
    this.output.emit(this.buildResult());
  }

  refresh = async (force = false) => {
    if (
      this.behavior.fetchStrategy === NetworkBackedBehaviorFetchStrategy.LocalOnly ||
      (!force &&
        this.behavior.fetchStrategy ===
          NetworkBackedBehaviorFetchStrategy.NetworkOnlyIfLocalIsNotShowable &&
        this.behavior.isLocalDataShowable(this.localData.currentValue))
    ) {
      return;
    }

    if (force) {
      this.isNetworkLoading = true;
      this.buildAndEmit();
    }
    try {
      const key = this.behavior.queryKey;
      if (key) {
        await this.refreshCached(key, force);
      } else {
        const response = await this.behavior.fetchFromApi(this.api, force);
        if (response.error) {
          throw response.error.error ?? new Error(response.error.message);
        }
        if (response.data !== undefined) {
          this.behavior.upsert(this.localData.currentValue, response.data);
        }
      }
      this.errors = undefined;
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      this.errors = [{ error: cause, message: cause.message }];
    } finally {
      this.isNetworkLoading = false;
      this.buildAndEmit();
    }
  };

  private async refreshCached(key: string, force: boolean) {
    const realm = this.behavior.realm;
    const state = realm.objectForPrimaryKey(CatalogQueryState, key);
    const hasLocalData = () =>
      this.behavior.hasLocalData(
        this.localData.currentValue,
        realm.objectForPrimaryKey(CatalogQueryState, key)?.resultIds ?? []
      );
    if (
      !force &&
      state?.hasAppliedData &&
      !state.retryPending &&
      state.lastCheckedAt &&
      Date.now() - state.lastCheckedAt.getTime() < 15 * 60 * 1000 &&
      hasLocalData()
    ) {
      return;
    }

    const requests = requestState(realm);
    const existing = requests.inflight.get(key);
    if (!force && existing) {
      return existing.promise;
    }
    const token = {};
    const promise = this.fetchAndApply(key, force, token, hasLocalData).finally(() => {
      if (requests.inflight.get(key)?.token === token) {
        requests.inflight.delete(key);
      }
    });
    requests.inflight.set(key, { token, promise });
    return promise;
  }

  private async fetchAndApply(
    key: string,
    force: boolean,
    token: object,
    hasLocalData: () => boolean
  ) {
    const realm = this.behavior.realm;
    const requests = requestState(realm);
    const isCurrent = () => requests.inflight.get(key)?.token === token;
    try {
      const state = realm.objectForPrimaryKey(CatalogQueryState, key);
      const etag = !force && state?.hasAppliedData && hasLocalData() ? state.etag : undefined;
      let response = await this.behavior.fetchFromApi(this.api, force, etag);
      if (!isCurrent()) {
        return;
      }
      if (response.error) {
        throw response.error.error ?? new Error(response.error.message);
      }
      if (response.type === RelistenApiResponseType.RequestContentsUnchanged) {
        const current = realm.objectForPrimaryKey(CatalogQueryState, key);
        if (
          etag &&
          response.etag === etag &&
          current?.etag === etag &&
          current.hasAppliedData &&
          hasLocalData()
        ) {
          realm.write(() => {
            current.lastCheckedAt = new Date();
            current.retryPending = false;
          });
          requests.retries.delete(key);
          return;
        }
        // A required root may have disappeared while the request was in flight.
        response = await this.behavior.fetchFromApi(this.api, force);
        if (!isCurrent()) {
          return;
        }
        if (response.error) {
          throw response.error.error ?? new Error(response.error.message);
        }
      }
      if (response.data === undefined || !response.etag) {
        throw new Error('Catalog refresh requires a resource body and ETag.');
      }
      const body = response.data;
      const validator = response.etag;
      realm.write(() => {
        const resultIds = this.behavior.upsert(this.localData.currentValue, body) ?? [];
        realm.create(
          CatalogQueryState,
          {
            key,
            etag: validator,
            hasAppliedData: true,
            lastAppliedAt: new Date(),
            lastCheckedAt: new Date(),
            retryPending: false,
            resultIds,
          },
          Realm.UpdateMode.Modified
        );
      });
      requests.retries.delete(key);
    } catch (error) {
      if (!isCurrent()) {
        return;
      }
      realm.write(() => {
        realm.create(CatalogQueryState, { key, retryPending: true }, Realm.UpdateMode.Modified);
      });
      requests.retries.set(key, () => this.refresh(force));
      throw error;
    }
  }
}

// Request coalescing lasts only while work is in flight. Persisted query state
// owns validators and freshness; no response body or permanent generation map is retained.
interface RepositoryRequests {
  inflight: Map<string, { token: object; promise: Promise<void> }>;
  retries: Map<string, () => Promise<void>>;
}
const requestsByRealm = new WeakMap<Realm, RepositoryRequests>();
function requestState(realm: Realm): RepositoryRequests {
  let state = requestsByRealm.get(realm);
  if (!state) {
    state = { inflight: new Map(), retries: new Map() };
    requestsByRealm.set(realm, state);
  }
  return state;
}
export async function retryCatalogRequests(realm: Realm) {
  const requests = requestsByRealm.get(realm);
  if (requests) {
    await Promise.allSettled([...requests.retries.values()].map((retry) => retry()));
  }
}
