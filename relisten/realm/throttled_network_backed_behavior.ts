import dayjs from 'dayjs';
import Realm from 'realm';
import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import {
  NetworkBackedBehavior,
  NetworkBackedBehaviorFetchStrategy,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';

export abstract class ThrottledNetworkBackedBehavior<
  TLocalData,
  TApiData,
> extends NetworkBackedBehavior<TLocalData, TApiData> {
  protected lastRequestAt: dayjs.Dayjs | undefined;
  protected minTimeBetweenRequestsSeconds: number;
  public readonly fetchStrategy: NetworkBackedBehaviorFetchStrategy;

  protected constructor(
    public realm: Realm.Realm,
    options?: NetworkBackedBehaviorOptions
  ) {
    super();

    this.minTimeBetweenRequestsSeconds = 60 * 15;
    this.fetchStrategy =
      options?.fetchStrategy || NetworkBackedBehaviorFetchStrategy.StaleWhileRevalidate;

    if (options?.minTimeBetweenRequestsSeconds !== undefined) {
      this.minTimeBetweenRequestsSeconds = options.minTimeBetweenRequestsSeconds;
    }
  }

  shouldPerformNetworkRequest(
    lastRequestAt: dayjs.Dayjs | undefined,
    localData: TLocalData
  ): boolean {
    if (
      this.fetchStrategy === NetworkBackedBehaviorFetchStrategy.LocalOnly ||
      (this.fetchStrategy === NetworkBackedBehaviorFetchStrategy.NetworkOnlyIfLocalIsNotShowable &&
        this.isLocalDataShowable(localData))
    ) {
      return false;
    }

    if (!lastRequestAt) {
      return true;
    }

    this.lastRequestAt = lastRequestAt;

    const msSinceLastRequest = dayjs().diff(lastRequestAt, 'milliseconds');

    return msSinceLastRequest >= this.minTimeBetweenRequestsSeconds * 1000;
  }

  abstract fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<TApiData | undefined>>;

  abstract isLocalDataShowable(localData: TLocalData): boolean;

  abstract upsert(localData: TLocalData, apiData: TApiData): void;
}
