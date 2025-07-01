import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import { Show as ApiShow } from '@/relisten/api/models/show';
import { Show } from '@/relisten/realm/models/show';
import { ShowsWithVenueNetworkBackedBehavior } from '@/relisten/realm/models/shows/show_with_venues_behavior';

import {
  NetworkBackedBehaviorFetchStrategy,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import { useRealm } from '@/relisten/realm/schema';
import { useMemo } from 'react';
import Realm from 'realm';
import EventEmitter from 'react-native/Libraries/vendor/emitter/EventEmitter';
import { RealmQueryValueStream } from '@/relisten/realm/value_streams';

class TodayShowsNetworkBackedBehavior extends ShowsWithVenueNetworkBackedBehavior {
  private emitter = new EventEmitter();
  private asOf = new Date();

  constructor(
    public realm: Realm.Realm,
    public artistUuids?: string[],
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<ApiShow[] | undefined>> {
    return api.todayShows(this.asOf, api.refreshOptions(forcedRefresh));
  }

  override createLocalUpdatingResults(): RealmQueryValueStream<Show> {
    const now = new Date();
    const formattedMonth = (now.getMonth() + 1).toFixed(0).padStart(2, '0');
    const formattedDay = now.getDate().toFixed(0).padStart(2, '0');

    let query = this.realm
      .objects(Show)
      .filtered('displayDate ENDSWITH $0', `-${formattedMonth}-${formattedDay}`);

    if (this.artistUuids) {
      query = query.filtered('artistUuid in $0', this.artistUuids);
    }

    query = query.sorted('displayDate', true);

    return new RealmQueryValueStream<Show>(this.realm, query);
  }
}

export const useTodayShows = (...artistUuids: string[]) => {
  const realm = useRealm();

  const behavior = useMemo(() => {
    return new TodayShowsNetworkBackedBehavior(realm, artistUuids, {
      fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkAlwaysFirst,
    });
  }, [realm, JSON.stringify(artistUuids)]);

  return useNetworkBackedBehavior(behavior);
};
