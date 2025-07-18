import {
  RelistenApiClient,
  RelistenApiClientError,
  RelistenApiResponse,
  RelistenApiResponseType,
} from '../api/client';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { NetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { log } from '@/relisten/util/logging';
import { EmittableValueStream, ValueStream } from '@/relisten/realm/value_streams';

export enum NetworkBackedBehaviorFetchStrategy {
  UNKNOWN,
  NetworkAlwaysFirst,
  StaleWhileRevalidate,
  LocalOnly,
  NetworkOnlyIfLocalIsNotShowable,
}

export abstract class NetworkBackedBehavior<TLocalData, TApiData> {
  abstract fetchStrategy: NetworkBackedBehaviorFetchStrategy;

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

  abstract shouldPerformNetworkRequest(
    lastRequestAt: dayjs.Dayjs | undefined,
    localData: TLocalData
  ): boolean;

  abstract isLocalDataShowable(localData: TLocalData): boolean;

  abstract upsert(localData: TLocalData | null, apiData: TApiData): void;
}

export interface NetworkBackedBehaviorOptions {
  minTimeBetweenRequestsSeconds?: number;
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
    this.refresh(this.isNetworkLoadingDefault).catch((e) => {
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

  refresh = async (shouldForceLoadingSpinner: boolean = false) => {
    if (shouldForceLoadingSpinner) {
      this.isNetworkLoading = true;
      this.buildAndEmit();
    }
    const apiData = await this.behavior.fetchFromApi(this.api, shouldForceLoadingSpinner);

    if (apiData?.type == RelistenApiResponseType.OnlineRequestCompleted) {
      if (apiData?.data && !apiData.duplicate) {
        this.behavior.upsert(this.localData.currentValue, apiData.data);
      }

      if (apiData?.error) {
        this.errors = [apiData?.error];
      }
    }

    this.isNetworkLoading = false;
    this.buildAndEmit();
  };
}
