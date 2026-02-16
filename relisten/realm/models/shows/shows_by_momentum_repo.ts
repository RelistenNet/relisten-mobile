import Realm from 'realm';
import { useMemo } from 'react';
import { Show } from '@/relisten/realm/models/show';
import { Show as ApiShow } from '@/relisten/api/models/show';
import {
  RelistenApiClient,
  RelistenApiResponse,
  RelistenApiResponseType,
} from '@/relisten/api/client';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import { useRealm } from '@/relisten/realm/schema';
import { ShowsWithVenueNetworkBackedBehavior } from '@/relisten/realm/models/shows/show_with_venues_behavior';
import {
  NetworkBackedBehaviorFetchStrategy,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { RealmQueryValueStream } from '@/relisten/realm/value_streams';

class ShowsByMomentumNetworkBackedBehavior extends ShowsWithVenueNetworkBackedBehavior {
  constructor(
    public realm: Realm.Realm,
    public artistUuids: string[],
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<ApiShow[] | undefined>> {
    if (this.artistUuids.length === 0) {
      return Promise.resolve({ type: RelistenApiResponseType.Offline, data: undefined });
    }

    return api.showsByMomentum(this.artistUuids, api.refreshOptions(forcedRefresh));
  }

  override createLocalUpdatingResults(): RealmQueryValueStream<Show> {
    let query = this.realm.objects(Show).filtered('popularity != nil');

    if (this.artistUuids.length > 0) {
      query = query.filtered('artistUuid in $0', this.artistUuids);
    }

    query = query.sorted('popularity.momentumScore', true);

    return new RealmQueryValueStream<Show>(this.realm, query);
  }
}

export const useShowsByMomentum = (artistUuids: string[]) => {
  const realm = useRealm();
  const artistUuidsKey = useMemo(() => {
    return [...new Set(artistUuids)].sort().join(',');
  }, [artistUuids]);

  const behavior = useMemo(() => {
    const normalizedArtistUuids = artistUuidsKey.length > 0 ? artistUuidsKey.split(',') : [];

    return new ShowsByMomentumNetworkBackedBehavior(realm, normalizedArtistUuids, {
      fetchStrategy: NetworkBackedBehaviorFetchStrategy.StaleWhileRevalidate,
    });
  }, [realm, artistUuidsKey]);

  return useNetworkBackedBehavior(behavior);
};
