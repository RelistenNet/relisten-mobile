import {
  RelistenApiClient,
  RelistenApiResponse,
  RelistenApiResponseType,
} from '@/relisten/api/client';
import { V4ShowSummaryResource as ApiShow } from '@/relisten/api/v4/wire_types';
import { useArtist } from '@/relisten/realm/models/artist_repo';
import { Show } from '@/relisten/realm/models/show';
import { ShowsWithVenueNetworkBackedBehavior } from '@/relisten/realm/models/shows/show_with_venues_behavior';
import {
  NetworkBackedBehaviorFetchStrategy,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import { mergeNetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { useRealm } from '@/relisten/realm/schema';
import { RealmQueryValueStream } from '@/relisten/realm/value_streams';
import { useMemo } from 'react';
import Realm from 'realm';

class TopShowsNetworkBackedBehavior extends ShowsWithVenueNetworkBackedBehavior {
  constructor(
    realm: Realm.Realm,
    public artistUuid: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  fetchShows(api: RelistenApiClient): Promise<RelistenApiResponse<ApiShow[] | undefined>> {
    if (!this.artistUuid) {
      return Promise.resolve({ type: RelistenApiResponseType.Offline, data: undefined });
    }

    return api.topShow(this.artistUuid);
  }

  override createLocalUpdatingResults(): RealmQueryValueStream<Show> {
    return new RealmQueryValueStream<Show>(
      this.realm,
      this.realm
        .objects(Show)
        .filtered('artistUuid == $0 && deletedAt == nil', this.artistUuid)
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
  }, [artistUuid, realm]);

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
