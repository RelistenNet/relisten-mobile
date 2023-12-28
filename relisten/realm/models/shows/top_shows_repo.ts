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
import { useQuery } from '@/relisten/realm/schema';
import { ShowsWithVenueNetworkBackedBehavior } from '@/relisten/realm/models/shows/show_with_venues_behavior';
import { NetworkBackedBehaviorFetchStrategy } from '@/relisten/realm/network_backed_behavior';

class TopShowsNetworkBackedBehavior extends ShowsWithVenueNetworkBackedBehavior {
  fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<ApiShow[] | undefined>> {
    if (!this.artistUuid) {
      return Promise.resolve({ type: RelistenApiResponseType.Offline, data: undefined });
    }

    return api.topShow(this.artistUuid, { bypassEtagCaching: true, bypassRateLimit: true });
  }

  useFetchFromLocal(): Realm.Results<Show> {
    const topShows = useQuery(
      Show,
      (query) => query.filtered('artistUuid == $0', this.artistUuid).sorted('avgRating', true),
      [this.artistUuid]
    );

    return topShows;
  }
}

export const useTopShows = (artistUuid: string) => {
  const behavior = useMemo(() => {
    return new TopShowsNetworkBackedBehavior(artistUuid, {
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
