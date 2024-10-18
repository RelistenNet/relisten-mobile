import { useObject, useQuery } from '../schema';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { useArtist } from './artist_repo';
import { NetworkBackedResults, mergeNetworkBackedResults } from '../network_backed_results';
import { useMemo } from 'react';
import { Venue } from './venue';
import { VenueWithShows } from '@/relisten/api/models/venue';
import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import {
  ThrottledNetworkBackedBehavior,
  NetworkBackedBehaviorOptions,
} from '../network_backed_behavior';
import { Show } from './show';
import { showRepo } from './show_repo';
import { venueRepo } from './venue_repo';
import Realm from 'realm';
import * as R from 'remeda';

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

  fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<VenueWithShows>> {
    return api.venue(this.artistUuid, this.venueUuid);
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

    const apiVenuesByUuid = R.fromEntries(
      R.flatMap(
        apiData.shows.filter((s) => !!s.venue),

        (s) => [[s.venue!.uuid, s.venue!]]
      )
    );

    realm.write(() => {
      const { createdModels: createdShows } = showRepo.upsertMultiple(
        realm,
        apiData.shows,
        localData.shows
      );

      for (const show of createdShows.concat(localData.shows)) {
        if (show.venueUuid) {
          const apiVenue = apiVenuesByUuid[show.venueUuid];

          if (!show.venue) {
            const localVenue = realm.objectForPrimaryKey(Venue, show.venueUuid);

            if (localVenue) {
              show.venue = localVenue;
            } else {
              const { createdModels: createdVenues } = venueRepo.upsert(realm, apiVenue, undefined);

              if (createdVenues.length > 0) {
                show.venue = createdVenues[0];
              }
            }
          } else {
            venueRepo.upsert(realm, apiVenue, show.venue);
          }
        }
      }
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
