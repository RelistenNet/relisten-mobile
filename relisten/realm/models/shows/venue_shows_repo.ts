import { useNetworkBackedBehavior } from '../../network_backed_behavior_hooks';
import { useArtist } from '../artist_repo';
import { mergeNetworkBackedResults, NetworkBackedResults } from '../../network_backed_results';
import { useMemo } from 'react';
import { Venue } from '../venue';
import { VenueWithShows } from '@/relisten/api/models/venue';
import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import { NetworkBackedBehaviorOptions } from '../../network_backed_behavior';
import { Show } from '../show';
import { venueRepo } from '../venue_repo';
import Realm from 'realm';
import { upsertShowList } from '@/relisten/realm/models/repo_utils';
import { useRealm } from '@/relisten/realm/schema';
import {
  CombinedValueStream,
  RealmObjectValueStream,
  RealmQueryValueStream,
  ValueStream,
} from '@/relisten/realm/value_streams';
import { ThrottledNetworkBackedBehavior } from '@/relisten/realm/throttled_network_backed_behavior';

export interface VenueShows {
  venue: Venue | null;
  shows: Realm.Results<Show>;
}

class VenueShowsNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  VenueShows,
  VenueWithShows
> {
  constructor(
    realm: Realm.Realm,
    public artistUuid: string,
    public venueUuid: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<VenueWithShows>> {
    return api.venue(this.artistUuid, this.venueUuid, api.refreshOptions(forcedRefresh));
  }

  override createLocalUpdatingResults(): ValueStream<VenueShows> {
    const venueResults = new RealmObjectValueStream(this.realm, Venue, this.venueUuid);
    const showsResults = new RealmQueryValueStream<Show>(
      this.realm,
      this.realm.objects(Show).filtered('venueUuid == $0', this.venueUuid)
    );

    return new CombinedValueStream(venueResults, showsResults, (venue, shows) => {
      return { venue, shows };
    });
  }

  isLocalDataShowable(localData: VenueShows): boolean {
    return localData.venue !== null && localData.shows.length > 0;
  }

  override upsert(localData: VenueShows, apiData: VenueWithShows): void {
    if (!localData.shows.isValid()) {
      return;
    }

    this.realm.write(() => {
      upsertShowList(this.realm, apiData.shows, localData.shows, {
        // we may not have all the shows here on initial load
        performDeletes: false,
        queryForModel: true,
        upsertModels: {
          // every venue is the same here, so just do it once here
          venues: true,
        },
      });

      venueRepo.upsert(this.realm, apiData, localData.venue || undefined);
    });
  }
}

export function useVenueShows(
  artistUuid: string,
  venueUuid: string
): NetworkBackedResults<VenueShows> {
  const realm = useRealm();
  const behavior = useMemo(() => {
    return new VenueShowsNetworkBackedBehavior(realm, artistUuid, venueUuid);
  }, [realm, artistUuid, venueUuid]);

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
