import Realm from 'realm';
import { Show } from '@/relisten/realm/models/show';
import { Show as ApiShow } from '@/relisten/api/models/show';
import {
  RelistenApiClient,
  RelistenApiResponse,
  RelistenApiResponseType,
} from '@/relisten/api/client';
import { useQuery } from '@/relisten/realm/schema';
import { useArtist } from '@/relisten/realm/models/artist_repo';
import { useMemo } from 'react';
import { mergeNetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import { ShowsWithVenueNetworkBackedBehavior } from '@/relisten/realm/models/shows/show_with_venues_behavior';

class RecentShowsNetworkBackedBehavior extends ShowsWithVenueNetworkBackedBehavior {
  constructor(
    public artistUuid?: string,
    public activeTab?: 'performed' | 'updated'
  ) {
    super();
  }

  fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<ApiShow[] | undefined>> {
    if (!this.artistUuid || !this.activeTab) {
      return Promise.resolve({ type: RelistenApiResponseType.Offline, data: undefined });
    }

    if (this.activeTab === 'performed') {
      return api.recentPerformedShows(this.artistUuid);
    } else {
      return api.recentUpdatedShows(this.artistUuid);
    }
  }

  fetchFromLocal(): Realm.Results<Show> {
    const sortKey = this.activeTab === 'performed' ? 'date' : 'updatedAt';
    return useQuery(
      Show,
      (query) => query.filtered('artistUuid == $0', this.artistUuid).sorted(sortKey, true),
      [this.artistUuid, sortKey]
    );
  }
}

export const useRecentShows = (artistUuid: string, activeTab: 'performed' | 'updated') => {
  const behavior = useMemo(() => {
    return new RecentShowsNetworkBackedBehavior(artistUuid, activeTab);
  }, [artistUuid, activeTab]);

  return useNetworkBackedBehavior(behavior);
};

export function useArtistRecentShows(artistUuid: string, activeTab: 'performed' | 'updated') {
  const artistResults = useArtist(artistUuid, { onlyFetchFromApiIfLocalIsNotShowable: true });
  const showResults = useRecentShows(artistUuid, activeTab);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      shows: showResults,
      artist: artistResults,
    });
  }, [showResults, artistResults, activeTab]);

  return results;
}
