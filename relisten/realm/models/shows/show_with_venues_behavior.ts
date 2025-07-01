import { NetworkBackedBehaviorOptions } from '@/relisten/realm/network_backed_behavior';
import Realm from 'realm';
import { Show } from '@/relisten/realm/models/show';
import { Show as ApiShow } from '@/relisten/api/models/show';
import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import { upsertShowList } from '@/relisten/realm/models/repo_utils';
import { ThrottledNetworkBackedBehavior } from '@/relisten/realm/throttled_network_backed_behavior';

export abstract class ShowsWithVenueNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  Realm.Results<Show>,
  ApiShow[]
> {
  constructor(realm: Realm.Realm, options?: NetworkBackedBehaviorOptions) {
    super(realm, options);
  }

  abstract fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<ApiShow[] | undefined>>;

  isLocalDataShowable(localData: Realm.Results<Show>): boolean {
    return localData.length > 0;
  }

  override upsert(localData: Realm.Results<Show>, apiData: ApiShow[]): void {
    this.realm.write(() => {
      upsertShowList(this.realm, apiData, localData, {
        performDeletes: false,
        queryForModel: true,
      });
    });
  }
}
