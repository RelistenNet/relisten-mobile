import {
  NetworkBackedBehaviorOptions,
  ThrottledNetworkBackedBehavior,
} from '@/relisten/realm/network_backed_behavior';
import Realm from 'realm';
import { Show } from '@/relisten/realm/models/show';
import { Show as ApiShow } from '@/relisten/api/models/show';
import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import { upsertShowList } from '@/relisten/realm/models/repo_utils';

export abstract class ShowsWithVenueNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  Realm.Results<Show>,
  ApiShow[]
> {
  constructor(
    public artistUuid?: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(options);
  }

  abstract fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<ApiShow[] | undefined>>;

  abstract useFetchFromLocal(): Realm.Results<Show>;

  isLocalDataShowable(localData: Realm.Results<Show>): boolean {
    return localData.length > 0;
  }

  upsert(realm: Realm, localData: Realm.Results<Show>, apiData: ApiShow[]): void {
    realm.write(() => {
      upsertShowList(realm, apiData, localData, {
        performDeletes: false,
        queryForModel: false,
      });
    });
  }
}
