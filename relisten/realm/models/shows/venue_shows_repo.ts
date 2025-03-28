import { useObject, useQuery } from '../../schema';
import { useNetworkBackedBehavior } from '../../network_backed_behavior_hooks';
import { useArtist } from '../artist_repo';
import { mergeNetworkBackedResults, NetworkBackedResults } from '../../network_backed_results';
import { useMemo } from 'react';
import { Venue } from '../venue';
import { VenueWithShows } from '@/relisten/api/models/venue';
import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import {
  NetworkBackedBehaviorOptions,
  ThrottledNetworkBackedBehavior,
} from '../../network_backed_behavior';
import { Show } from '../show';
import { venueRepo } from '../venue_repo';
import Realm from 'realm';
import { upsertShowList } from '@/relisten/realm/models/repo_utils';

export interface VenueShows {
  venue: Venue | null;
  shows: Realm.Results<Show>;
}

class VenueShowsNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  VenueShows,
  VenueWithShows
> {
  constructor(
    public artistUuid: string,
    public venueUuid: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(options);
  }

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<VenueWithShows>> {
    return api.venue(this.artistUuid, this.venueUuid, api.refreshOptions(forcedRefresh));
  }

  useFetchFromLocal(): VenueShows {
    const venue = useObject(Venue, this.venueUuid) || null;
    const shows = useQuery(Show, (query) => query.filtered('venueUuid == $0', this.venueUuid), [
      this.venueUuid,
    ]);

    const obj = useMemo(() => {
      return { venue, shows };
    }, [venue, shows]);

    return obj;
  }

  isLocalDataShowable(localData: VenueShows): boolean {
    return localData.venue !== null && localData.shows.length > 0;
  }

  upsert(realm: Realm, localData: VenueShows, apiData: VenueWithShows): void {
    if (!localData.shows.isValid()) {
      return;
    }

    realm.write(() => {
      upsertShowList(realm, apiData.shows, localData.shows, {
        // we may not have all the shows here on initial load
        performDeletes: false,
        queryForModel: true,
        upsertModels: {
          // every venue is the same here, so just do it once here
          venues: true,
        },
      });

      venueRepo.upsert(realm, apiData, localData.venue || undefined);
    });
  }
}

export function useVenueShows(
  artistUuid: string,
  venueUuid: string
): NetworkBackedResults<VenueShows> {
  const behavior = useMemo(() => {
    return new VenueShowsNetworkBackedBehavior(artistUuid, venueUuid);
  }, [artistUuid, venueUuid]);

  return useNetworkBackedBehavior(behavior);
}

export const useArtistVenueShows = (artistUuid: string, venueUuid: string) => {
  const artistResults = useArtist(artistUuid);
  const venueResults = useVenueShows(artistUuid, venueUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      venue: venueResults,
      artist: artistResults,
    });
  }, [venueResults, artistResults]);

  return results;
};
