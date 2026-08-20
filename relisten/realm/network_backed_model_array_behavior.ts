import Realm, { AnyRealmObject } from 'realm';
import { RelistenApiUpdatableObject, Repository } from '@/relisten/realm/repository';
import { RelistenObjectRequiredProperties } from '@/relisten/realm/relisten_object';
import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import {
  RealmQueryValueStream,
  RetainedCatalogResultsValueStream,
  ValueStream,
} from '@/relisten/realm/value_streams';
import { NetworkBackedBehaviorOptions } from '@/relisten/realm/network_backed_behavior';
import { ThrottledNetworkBackedBehavior } from '@/relisten/realm/throttled_network_backed_behavior';
import { CatalogRetirementState } from '@/relisten/realm/catalog_retirement_schema';

export class NetworkBackedModelArrayBehavior<
  TModel extends AnyRealmObject &
    RequiredProperties &
    RequiredRelationships &
    CatalogRetirementState,
  TApi extends RelistenApiUpdatableObject,
  RequiredProperties extends RelistenObjectRequiredProperties,
  RequiredRelationships extends object,
> extends ThrottledNetworkBackedBehavior<Realm.Results<TModel>, TApi[]> {
  constructor(
    public realm: Realm.Realm,
    public repository: Repository<TModel, TApi, RequiredProperties, RequiredRelationships>,
    public fetchFromRealm: (realm: Realm.Realm) => Realm.Results<TModel>,
    public apiCall: (
      api: RelistenApiClient,
      forcedRefresh: boolean
    ) => Promise<RelistenApiResponse<TApi[]>>,
    options?: NetworkBackedBehaviorOptions,
    private readonly retainedAccessSite?: string
  ) {
    super(realm, options);
  }

  override createLocalUpdatingResults(): ValueStream<Realm.Results<TModel>> {
    const results = this.fetchFromRealm(this.realm);
    return this.retainedAccessSite
      ? new RetainedCatalogResultsValueStream(this.realm, results, this.retainedAccessSite)
      : new RealmQueryValueStream<TModel>(this.realm, results);
  }

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<TApi[]>> {
    return this.apiCall(api, forcedRefresh);
  }

  isLocalDataShowable(localData: Realm.Results<TModel>): boolean {
    return localData.length > 0;
  }

  override upsert(localData: Realm.Results<TModel>, apiData: TApi[]): void {
    this.repository.upsertMultiple(this.realm, apiData, localData);
  }
}
