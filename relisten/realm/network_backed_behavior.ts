import { RelistenApiUpdatableObject, Repository } from './repository';
import { RelistenObjectRequiredProperties } from './relisten_object';
import { RelistenApiClient, RelistenApiResponse } from '../api/client';
import dayjs from 'dayjs';
import Realm from 'realm';

export enum NetworkBackedBehaviorFetchStrategy {
  UNKNOWN,
  NetworkAlwaysFirst,
  StaleWhileRevalidate,
  LocalOnly,
  NetworkOnlyIfLocalIsNotShowable,
}

export interface NetworkBackedBehavior<TLocalData, TApiData> {
  fetchStrategy: NetworkBackedBehaviorFetchStrategy;

  useFetchFromLocal(): TLocalData;

  fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<TApiData | undefined>>;

  shouldPerformNetworkRequest(
    lastRequestAt: dayjs.Dayjs | undefined,
    localData: TLocalData
  ): boolean;

  isLocalDataShowable(localData: TLocalData): boolean;

  upsert(realm: Realm, localData: TLocalData | null, apiData: TApiData): void;
}

export interface NetworkBackedBehaviorOptions {
  minTimeBetweenRequestsSeconds?: number;
  fetchStrategy?: NetworkBackedBehaviorFetchStrategy;
}

export abstract class ThrottledNetworkBackedBehavior<TLocalData, TApiData>
  implements NetworkBackedBehavior<TLocalData, TApiData>
{
  protected lastRequestAt: dayjs.Dayjs | undefined;
  protected minTimeBetweenRequestsSeconds: number;
  public readonly fetchStrategy: NetworkBackedBehaviorFetchStrategy;

  protected constructor(options?: NetworkBackedBehaviorOptions) {
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

  abstract fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<TApiData | undefined>>;

  abstract useFetchFromLocal(): TLocalData;

  abstract isLocalDataShowable(localData: TLocalData): boolean;

  abstract upsert(realm: Realm, localData: TLocalData, apiData: TApiData): void;
}

export class NetworkBackedModelArrayBehavior<
  TModel extends RequiredProperties & RequiredRelationships,
  TApi extends RelistenApiUpdatableObject,
  RequiredProperties extends RelistenObjectRequiredProperties,
  RequiredRelationships extends object,
> extends ThrottledNetworkBackedBehavior<Realm.Results<TModel>, TApi[]> {
  constructor(
    public repository: Repository<TModel, TApi, RequiredProperties, RequiredRelationships>,
    public fetchFromRealm: () => Realm.Results<TModel>,
    public apiCall: (api: RelistenApiClient) => Promise<RelistenApiResponse<TApi[]>>,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(options);
  }

  fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<TApi[]>> {
    return this.apiCall(api);
  }

  useFetchFromLocal(): Realm.Results<TModel> {
    return this.fetchFromRealm();
  }

  isLocalDataShowable(localData: Realm.Results<TModel>): boolean {
    return localData.length > 0;
  }

  upsert(realm: Realm, localData: Realm.Results<TModel>, apiData: TApi[]): void {
    this.repository.upsertMultiple(realm, apiData, localData);
  }
}

export class NetworkBackedModelBehavior<
  TModel extends RequiredProperties & RequiredRelationships,
  TApi extends RelistenApiUpdatableObject,
  RequiredProperties extends RelistenObjectRequiredProperties,
  RequiredRelationships extends object,
> extends ThrottledNetworkBackedBehavior<TModel | null, TApi> {
  constructor(
    public repository: Repository<TModel, TApi, RequiredProperties, RequiredRelationships>,
    public fetchFromRealm: () => TModel | null,
    public apiCall: (api: RelistenApiClient) => Promise<RelistenApiResponse<TApi>>,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(options);
  }

  fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<TApi>> {
    return this.apiCall(api);
  }

  useFetchFromLocal(): TModel | null {
    return this.fetchFromRealm();
  }

  isLocalDataShowable(localData: TModel | null): boolean {
    return localData !== null;
  }

  upsert(realm: Realm, localData: TModel, apiData: TApi): void {
    this.repository.upsert(realm, apiData, localData);
  }
}
