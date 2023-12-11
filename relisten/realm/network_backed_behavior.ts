import Realm from 'realm';
import { RelistenApiClient, RelistenApiResponse } from '../api/client';
import { RelistenObjectRequiredProperties } from './relisten_object';
import { RelistenApiUpdatableObject, Repository } from './repository';

export interface NetworkBackedBehavior<TLocalData, TApiData> {
  cacheKey: string | Array<string | number | undefined>;
  fetchFromLocal(): TLocalData;

  fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<TApiData | undefined>>;

  shouldPerformNetworkRequest(localData: TLocalData): boolean;

  isLocalDataShowable(localData: TLocalData): boolean;

  upsert(realm: Realm, localData: TLocalData, apiData: TApiData): void;
}

export abstract class ThrottledNetworkBackedBehavior<TLocalData, TApiData>
  implements NetworkBackedBehavior<TLocalData, TApiData>
{
  cacheKey!: string | Array<string | number | undefined>;

  protected onlyFetchFromApiIfLocalIsNotShowable: boolean;

  protected constructor(onlyFetchFromApiIfLocalIsNotShowable?: boolean) {
    this.onlyFetchFromApiIfLocalIsNotShowable = false;

    if (onlyFetchFromApiIfLocalIsNotShowable !== undefined) {
      this.onlyFetchFromApiIfLocalIsNotShowable = onlyFetchFromApiIfLocalIsNotShowable;
    }

    // if (!this.cacheKey) {
    //   throw new Error('Please specify a cacheKey');
    // }
  }

  shouldPerformNetworkRequest(localData: TLocalData): boolean {
    if (this.onlyFetchFromApiIfLocalIsNotShowable && this.isLocalDataShowable(localData)) {
      return false;
    }

    return true;
  }

  abstract fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<TApiData | undefined>>;

  abstract fetchFromLocal(): TLocalData;

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
    public cacheKey: string | Array<string | number | undefined>,
    public repository: Repository<TModel, TApi, RequiredProperties, RequiredRelationships>,
    public fetchFromRealm: () => Realm.Results<TModel>,
    public apiCall: (api: RelistenApiClient) => Promise<RelistenApiResponse<TApi[]>>,
    onlyFetchFromApiIfLocalIsNotShowable?: boolean
  ) {
    super(onlyFetchFromApiIfLocalIsNotShowable);
  }

  fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<TApi[]>> {
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
  RequiredRelationships extends object,
> extends ThrottledNetworkBackedBehavior<TModel | null, TApi> {
  constructor(
    public cacheKey: string | Array<string | number | undefined>,
    public repository: Repository<TModel, TApi, RequiredProperties, RequiredRelationships>,
    public fetchFromRealm: () => TModel | null,
    public apiCall: (api: RelistenApiClient) => Promise<RelistenApiResponse<TApi>>,
    onlyFetchFromApiIfLocalIsNotShowable?: boolean
  ) {
    super(onlyFetchFromApiIfLocalIsNotShowable);
  }

  fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<TApi>> {
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
