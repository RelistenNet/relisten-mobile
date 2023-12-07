import { Repository } from '../repository';
import { useObject, useQuery } from '../schema';
import {
  createNetworkBackedModelArrayHook,
  useNetworkBackedBehavior,
} from '../network_backed_behavior_hooks';
import { useArtist } from './artist_repo';
import { mergeNetworkBackedResults, NetworkBackedResults } from '../network_backed_results';
import { useMemo } from 'react';
import Realm from 'realm';
import { Show } from './show';
import { ThrottledNetworkBackedBehavior } from '../network_backed_behavior';
import { RelistenApiClient, RelistenApiResponse } from '../../api/client';
import * as R from 'remeda';
// import { venueRepo } from './venue_repo';
import { Venue } from './venue';
import { VenueWithShowCounts } from '@/relisten/api/models/venue';

export const venueRepo = new Repository(Venue);

export const useVenues = (artistUuid: string) => {
  return createNetworkBackedModelArrayHook(
    venueRepo,
    () => {
      const artistQuery = useQuery(
        Venue,
        (query) => query.filtered('artistUuid == $0', artistUuid),
        [artistUuid]
      );

      return artistQuery;
    },
    (api) => api.venues(artistUuid)
  )();
};

export const useArtistVenues = (artistUuid: string) => {
  const artistResults = useArtist(artistUuid, { onlyFetchFromApiIfLocalIsNotShowable: true });
  const venuesResults = useVenues(artistUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      venues: venuesResults,
      artist: artistResults,
    });
  }, [venuesResults, artistResults]);

  return results;
};

export interface VenueShows {
  venue: Venue | null;
  shows: Realm.Results<Show>;
}

class VenueShowsNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  VenueShows,
  VenueWithShowCounts
> {
  constructor(public artistUuid: string, public venueUuid: string) {
    super();
  }

  fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<VenueWithShowCounts>> {
    return api.venue(this.artistUuid, this.venueUuid);
  }

  fetchFromLocal(): VenueShows {
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

  upsert(realm: Realm, localData: VenueShows, apiData: VenueWithShowCounts): void {
    if (!localData.shows.isValid()) {
      return;
    }

    // TODO: Convert this code from year to venue
    // const apiVenuesByUuid = R.flatMapToObj(
    //   apiData.shows.filter((s) => !!s.venue),
    //   // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    //   (s) => [[s.venue!.uuid, s.venue!]]
    // );

    // realm.write(() => {
    //   const { createdModels: createdShows } = showRepo.upsertMultiple(
    //     realm,
    //     apiData.shows,
    //     localData.shows
    //   );

    //   for (const show of createdShows.concat(localData.shows)) {
    //     if (show.venueUuid) {
    //       const apiVenue = apiVenuesByUuid[show.venueUuid];

    //       if (!show.venue) {
    //         const localVenue = realm.objectForPrimaryKey(Venue, show.venueUuid);

    //         if (localVenue) {
    //           show.venue = localVenue;
    //         } else {
    //           const { createdModels: createdVenues } = venueRepo.upsert(
    //             realm,
    //             apiVenue,
    //             localVenue
    //           );

    //           if (createdVenues.length > 0) {
    //             show.venue = createdVenues[0];
    //           }
    //         }
    //       } else {
    //         venueRepo.upsert(realm, apiVenue, show.venue);
    //       }
    //     }
    //   }
    // });
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

export const useArtistYearShows = (artistUuid: string, venueUuid: string) => {
  const artistResults = useArtist(artistUuid, { onlyFetchFromApiIfLocalIsNotShowable: true });
  const venueShowsResults = useVenueShows(artistUuid, venueUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      venueShows: venueShowsResults,
      artist: artistResults,
    });
  }, [venueShowsResults, artistResults]);

  return results;
};
