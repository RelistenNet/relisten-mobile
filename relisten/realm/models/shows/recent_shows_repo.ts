import {
  RelistenApiClient,
  RelistenApiResponse,
  RelistenApiResponseType,
} from '@/relisten/api/client';
import { ShowSummaryResource as ApiShow } from '@/relisten/api/catalog/resources';
import { useArtist } from '@/relisten/realm/models/artist_repo';
import { Show } from '@/relisten/realm/models/show';
import { ShowsWithVenueNetworkBackedBehavior } from '@/relisten/realm/models/shows/show_with_venues_behavior';
import {
  NetworkBackedBehaviorFetchStrategy,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import { mergeNetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { RealmQueryValueStream } from '@/relisten/realm/value_streams';
import { useMemo } from 'react';
import Realm from 'realm';
import { useRealm } from '../../schema';

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

  fetchShows(api: RelistenApiClient): Promise<RelistenApiResponse<ApiShow[] | undefined>> {
    if (!this.artistUuid || !this.activeTab) {
      return Promise.resolve({ type: RelistenApiResponseType.Offline, data: undefined });
    }

    if (this.activeTab === RecentShowTabs.Performed) {
      return api.recentPerformedShows(this.artistUuid);
    } else {
      return api.recentUpdatedShows(this.artistUuid);
    }
  }

  override createLocalUpdatingResults(): RealmQueryValueStream<Show> {
    const sortKey = this.activeTab === RecentShowTabs.Performed ? 'date' : 'updatedAt';

    return new RealmQueryValueStream<Show>(
      this.realm,
      this.realm
        .objects(Show)
        .filtered('artistUuid == $0 && deletedAt == nil', this.artistUuid)
        .sorted(sortKey, true)
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
