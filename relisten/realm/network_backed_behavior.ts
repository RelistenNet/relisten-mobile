import { RelistenApiUpdatableObject, Repository } from './repository';
import { RelistenObjectRequiredProperties } from './relisten_object';
import { RelistenApiClient } from '../api/client';
import dayjs from 'dayjs';
import Realm from 'realm';

export interface NetworkBackedBehavior<TLocalData, TApiData> {
  fetchFromLocal(): TLocalData;

  fetchFromApi(api: RelistenApiClient): Promise<TApiData>;

  shouldPerformNetworkRequest(
    lastRequestAt: dayjs.Dayjs | undefined,
    localData: TLocalData
  ): boolean;

  isLocalDataShowable(localData: TLocalData): boolean;

  upsert(realm: Realm, localData: TLocalData, apiData: TApiData): void;
}

export abstract class ThrottledNetworkBackedBehavior<TLocalData, TApiData>
  implements NetworkBackedBehavior<TLocalData, TApiData>
{
  protected lastRequestAt: dayjs.Dayjs | undefined;
  protected minTimeBetweenRequestsSeconds: number;
  protected onlyFetchFromApiIfLocalIsNotShowable: boolean;

  protected constructor(
    minTimeBetweenRequestsSeconds?: number,
    onlyFetchFromApiIfLocalIsNotShowable?: boolean
  ) {
    this.minTimeBetweenRequestsSeconds = 60 * 15;
    this.onlyFetchFromApiIfLocalIsNotShowable = false;

    if (minTimeBetweenRequestsSeconds !== undefined) {
      this.minTimeBetweenRequestsSeconds = minTimeBetweenRequestsSeconds;
    }

    if (onlyFetchFromApiIfLocalIsNotShowable !== undefined) {
      this.onlyFetchFromApiIfLocalIsNotShowable = onlyFetchFromApiIfLocalIsNotShowable;
    }
  }

  shouldPerformNetworkRequest(
    lastRequestAt: dayjs.Dayjs | undefined,
    localData: TLocalData
  ): boolean {
    if (!lastRequestAt) {
      return true;
    }

    if (this.onlyFetchFromApiIfLocalIsNotShowable && this.isLocalDataShowable(localData)) {
      return false;
    }

    this.lastRequestAt = lastRequestAt;

    const msSinceLastRequest = dayjs().diff(lastRequestAt, 'milliseconds');

    return msSinceLastRequest >= this.minTimeBetweenRequestsSeconds * 1000;
  }

  abstract fetchFromApi(api: RelistenApiClient): Promise<TApiData>;

  abstract fetchFromLocal(): TLocalData;

  abstract isLocalDataShowable(localData: TLocalData): boolean;

  abstract upsert(realm: Realm, localData: TLocalData, apiData: TApiData): void;
}

export class NetworkBackedModelArrayBehavior<
  TModel extends RequiredProperties & RequiredRelationships,
  TApi extends RelistenApiUpdatableObject,
  RequiredProperties extends RelistenObjectRequiredProperties,
  RequiredRelationships extends object
> extends ThrottledNetworkBackedBehavior<Realm.Results<TModel>, TApi[]> {
  constructor(
    public repository: Repository<TModel, TApi, RequiredProperties, RequiredRelationships>,
    public fetchFromRealm: () => Realm.Results<TModel>,
    public apiCall: (api: RelistenApiClient) => Promise<TApi[]>,
    minTimeBetweenRequestsSeconds?: number,
    onlyFetchFromApiIfLocalIsNotShowable?: boolean
  ) {
    super(minTimeBetweenRequestsSeconds, onlyFetchFromApiIfLocalIsNotShowable);
  }

  fetchFromApi(api: RelistenApiClient): Promise<TApi[]> {
    return this.apiCall(api);
  }

  fetchFromLocal(): Realm.Results<TModel> {
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
  RequiredRelationships extends object
> extends ThrottledNetworkBackedBehavior<TModel | null, TApi> {
  constructor(
    public repository: Repository<TModel, TApi, RequiredProperties, RequiredRelationships>,
    public fetchFromRealm: () => TModel | null,
    public apiCall: (api: RelistenApiClient) => Promise<TApi>,
    minTimeBetweenRequestsSeconds?: number,
    onlyFetchFromApiIfLocalIsNotShowable?: boolean
  ) {
    super(minTimeBetweenRequestsSeconds, onlyFetchFromApiIfLocalIsNotShowable);
  }

  fetchFromApi(api: RelistenApiClient): Promise<TApi> {
    return this.apiCall(api);
  }

  fetchFromLocal(): TModel | null {
    return this.fetchFromRealm();
  }

  isLocalDataShowable(localData: TModel | null): boolean {
    return localData !== null;
  }

  upsert(realm: Realm, localData: TModel, apiData: TApi): void {
    this.repository.upsert(realm, apiData, localData);
  }
}
