import { NetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { EmittableValueStream, ValueStream } from '@/relisten/realm/value_streams';
import { log } from '@/relisten/util/logging';
import Realm from 'realm';
import { RelistenApiClient, RelistenApiClientError, RelistenApiResponse } from '../api/client';

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
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<TApiData | undefined>>;

  abstract isLocalDataShowable(localData: TLocalData): boolean;

  // Repositories may use their successfully loaded domain data to avoid redundant fetches.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  shouldPerformNetworkRequest(_localData: TLocalData): boolean {
    return true;
  }

  abstract upsert(localData: TLocalData, apiData: TApiData): void;
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
  private refreshGeneration = 0;
  private tornDown = false;
  private pending?: Promise<void>;

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
    this.tornDown = true;
    failedRequests(this.behavior.realm).delete(this.refresh);
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

  refresh = (force = false): Promise<void> => {
    if (this.pending && !force) return this.pending;
    const pending = this.executeRefresh(force).finally(() => {
      if (this.pending === pending) this.pending = undefined;
    });
    this.pending = pending;
    return pending;
  };

  private async executeRefresh(force: boolean) {
    if (
      this.behavior.fetchStrategy === NetworkBackedBehaviorFetchStrategy.LocalOnly ||
      (!force &&
        this.behavior.fetchStrategy ===
          NetworkBackedBehaviorFetchStrategy.NetworkOnlyIfLocalIsNotShowable &&
        this.behavior.isLocalDataShowable(this.localData.currentValue))
    ) {
      return;
    }

    if (
      !force &&
      !this.errors &&
      !this.behavior.shouldPerformNetworkRequest(this.localData.currentValue)
    )
      return;

    const generation = ++this.refreshGeneration;
    if (force) {
      this.isNetworkLoading = true;
      this.buildAndEmit();
    }
    try {
      const response = await this.behavior.fetchFromApi(this.api, force);
      if (
        generation !== this.refreshGeneration ||
        this.behavior.realm.isClosed ||
        response.superseded
      )
        return;
      if (response.error) {
        throw response.error.error ?? new Error(response.error.message);
      }
      if (response.data !== undefined && !appliedResponses(this.behavior.realm).has(response)) {
        this.behavior.realm.write(() => {
          this.behavior.upsert(this.localData.currentValue, response.data!);
        });
        appliedResponses(this.behavior.realm).add(response);
      }
      failedRequests(this.behavior.realm).delete(this.refresh);
      if (generation !== this.refreshGeneration) return;
      this.errors = undefined;
    } catch (error) {
      if (generation !== this.refreshGeneration) return;
      const cause = error instanceof Error ? error : new Error(String(error));
      this.errors = [{ error: cause, message: cause.message }];
      if (!this.tornDown) failedRequests(this.behavior.realm).add(this.refresh);
    } finally {
      if (generation === this.refreshGeneration) {
        this.isNetworkLoading = false;
        this.buildAndEmit();
      }
    }
  }
}

// Only mounted, failed behaviors remain eligible for a connectivity retry.
const failuresByRealm = new WeakMap<Realm, Set<() => Promise<void>>>();
function failedRequests(realm: Realm) {
  let failures = failuresByRealm.get(realm);
  if (!failures) {
    failures = new Set();
    failuresByRealm.set(realm, failures);
  }
  return failures;
}

export async function retryFailedRequests(realm: Realm) {
  await Promise.allSettled([...failedRequests(realm)].map((retry) => retry()));
}

// A shared HTTP result may reach several behaviors. Publish it once per Realm;
// a failed transaction remains eligible for another consumer or retry.
const appliedByRealm = new WeakMap<Realm, WeakSet<object>>();
function appliedResponses(realm: Realm) {
  let responses = appliedByRealm.get(realm);
  if (!responses) {
    responses = new WeakSet();
    appliedByRealm.set(realm, responses);
  }
  return responses;
}
