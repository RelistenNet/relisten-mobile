import Realm from 'realm';
import { Show } from '@/relisten/realm/models/show';
import { Show as ApiShow } from '@/relisten/api/models/show';
import {
  RelistenApiClient,
  RelistenApiResponse,
  RelistenApiResponseType,
} from '@/relisten/api/client';
import { useArtist } from '@/relisten/realm/models/artist_repo';
import { useMemo } from 'react';
import { mergeNetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import { ShowsWithVenueNetworkBackedBehavior } from '@/relisten/realm/models/shows/show_with_venues_behavior';
import {
  NetworkBackedBehaviorFetchStrategy,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { useRealm } from '../../schema';
import { RealmQueryValueStream } from '@/relisten/realm/value_streams';

export enum RecentShowTabs {
  Performed = 'performed',
  Updated = 'updated',
}

class RecentShowsNetworkBackedBehavior extends ShowsWithVenueNetworkBackedBehavior {
  constructor(
    public realm: Realm.Realm,
    public artistUuid?: string,
    public activeTab?: RecentShowTabs,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<ApiShow[] | undefined>> {
    if (!this.artistUuid || !this.activeTab) {
      return Promise.resolve({ type: RelistenApiResponseType.Offline, data: undefined });
    }

    const refreshOptions = api.refreshOptions(forcedRefresh) || {};

    if (this.activeTab === RecentShowTabs.Performed) {
      return api.recentPerformedShows(this.artistUuid, {
        bypassRateLimit: false,
        bypassEtagCaching: true,
        ...refreshOptions,
      });
    } else {
      return api.recentUpdatedShows(this.artistUuid, {
        bypassRateLimit: false,
        bypassEtagCaching: true,
        ...refreshOptions,
      });
    }
  }

  override createLocalUpdatingResults(): RealmQueryValueStream<Show> {
    const sortKey = this.activeTab === RecentShowTabs.Performed ? 'date' : 'updatedAt';

    return new RealmQueryValueStream<Show>(
      this.realm,
      this.realm.objects(Show).filtered('artistUuid == $0', this.artistUuid).sorted(sortKey, true)
    );
  }
}

export const useRecentShows = (artistUuid?: string, activeTab?: RecentShowTabs) => {
  const realm = useRealm();
  const behavior = useMemo(() => {
    return new RecentShowsNetworkBackedBehavior(realm, artistUuid, activeTab, {
      fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkAlwaysFirst,
    });
  }, [realm, artistUuid, activeTab]);

  return useNetworkBackedBehavior(behavior);
};

export function useArtistRecentShows(artistUuid?: string, activeTab?: RecentShowTabs) {
  const artistResults = useArtist(artistUuid);
  const showResults = useRecentShows(artistUuid, activeTab);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      shows: showResults,
      artist: artistResults,
    });
  }, [showResults, artistResults, activeTab]);

  return results;
}
