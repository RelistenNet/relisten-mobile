import { useMemo } from 'react';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import { useArtist } from '@/relisten/realm/models/artist_repo';
import { mergeNetworkBackedResults } from '@/relisten/realm/network_backed_results';
import Realm from 'realm';
import { Show } from '@/relisten/realm/models/show';
import { Show as ApiShow } from '@/relisten/api/models/show';
import {
  RelistenApiClient,
  RelistenApiResponse,
  RelistenApiResponseType,
} from '@/relisten/api/client';
import { useRealm } from '@/relisten/realm/schema';
import { ShowsWithVenueNetworkBackedBehavior } from '@/relisten/realm/models/shows/show_with_venues_behavior';
import {
  NetworkBackedBehaviorFetchStrategy,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { RealmQueryValueStream } from '@/relisten/realm/value_streams';

class TopShowsNetworkBackedBehavior extends ShowsWithVenueNetworkBackedBehavior {
  constructor(
    realm: Realm.Realm,
    public artistUuid: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<ApiShow[] | undefined>> {
    if (!this.artistUuid) {
      return Promise.resolve({ type: RelistenApiResponseType.Offline, data: undefined });
    }

    const refreshOptions = api.refreshOptions(forcedRefresh);

    return api.topShow(this.artistUuid, {
      bypassEtagCaching: true,
      bypassRateLimit: true,
      ...refreshOptions,
    });
  }

  override createLocalUpdatingResults(): RealmQueryValueStream<Show> {
    return new RealmQueryValueStream<Show>(
      this.realm,
      this.realm
        .objects(Show)
        .filtered('artistUuid == $0', this.artistUuid)
        .sorted('avgRating', true)
    );
  }
}

export const useTopShows = (artistUuid: string) => {
  const realm = useRealm();
  const behavior = useMemo(() => {
    return new TopShowsNetworkBackedBehavior(realm, artistUuid, {
      fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkAlwaysFirst,
    });
  }, [artistUuid]);

  return useNetworkBackedBehavior(behavior);
};

export function useArtistTopShows(artistUuid: string) {
  const artistResults = useArtist(artistUuid);
  const showResults = useTopShows(artistUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      shows: showResults,
      artist: artistResults,
    });
  }, [showResults, artistResults]);

  return results;
}
