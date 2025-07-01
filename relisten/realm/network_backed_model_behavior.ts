import Realm, { AnyRealmObject } from 'realm';
import { RelistenApiUpdatableObject, Repository } from '@/relisten/realm/repository';
import { RelistenObjectRequiredProperties } from '@/relisten/realm/relisten_object';
import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import { RealmObjectValueStream, ValueStream } from '@/relisten/realm/value_streams';
import { NetworkBackedBehaviorOptions } from '@/relisten/realm/network_backed_behavior';
import { ThrottledNetworkBackedBehavior } from '@/relisten/realm/throttled_network_backed_behavior';

export class NetworkBackedModelBehavior<
  TModel extends AnyRealmObject & RequiredProperties & RequiredRelationships,
  TApi extends RelistenApiUpdatableObject,
  RequiredProperties extends RelistenObjectRequiredProperties,
  RequiredRelationships extends object,
> extends ThrottledNetworkBackedBehavior<TModel | null, TApi> {
  constructor(
    public realm: Realm.Realm,
    public repository: Repository<TModel, TApi, RequiredProperties, RequiredRelationships>,
    public fetchFromRealm: () => [
      type: string | (new (...args: unknown[]) => TModel),
      primaryKey: TModel[keyof TModel],
    ],
    public apiCall: (
      api: RelistenApiClient,
      forcedRefresh: boolean
    ) => Promise<RelistenApiResponse<TApi>>,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  fetchFromApi(api: RelistenApiClient, forcedRefresh: boolean): Promise<RelistenApiResponse<TApi>> {
    return this.apiCall(api, forcedRefresh);
  }

  override createLocalUpdatingResults(): ValueStream<TModel | null> {
    const [type, primaryKey] = this.fetchFromRealm();
    return new RealmObjectValueStream<TModel>(this.realm, type, primaryKey);
  }

  isLocalDataShowable(localData: TModel | null): boolean {
    return localData !== null;
  }

  override upsert(localData: TModel, apiData: TApi): void {
    this.repository.upsert(this.realm, apiData, localData);
  }
}
