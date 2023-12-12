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
import { TourWithShowCount, TourWithShows } from '@/relisten/api/models/tour';
import { Tour } from './tour';

export const tourRepo = new Repository(Tour);

export const useTours = (artistUuid: string) => {
  return createNetworkBackedModelArrayHook(
    tourRepo,
    () => {
      const artistQuery = useQuery(
        Tour,
        (query) => query.filtered('artistUuid == $0', artistUuid),
        [artistUuid]
      );

      return artistQuery;
    },
    (api) => api.tours(artistUuid)
  )();
};

export const useArtistTours = (artistUuid: string) => {
  const artistResults = useArtist(artistUuid, { onlyFetchFromApiIfLocalIsNotShowable: true });
  const toursResults = useTours(artistUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      tours: toursResults,
      artist: artistResults,
    });
  }, [toursResults, artistResults]);

  return results;
};

export interface TourShows {
  tour: Tour | null;
  shows: Realm.Results<Show>;
}

class TourShowsNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  TourShows,
  TourWithShows
> {
  constructor(
    public artistUuid: string,
    public tourUuid: string
  ) {
    super();
  }

  fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<TourWithShows>> {
    return api.tour(this.artistUuid, this.tourUuid);
  }

  fetchFromLocal(): TourShows {
    const tour = useObject(Tour, this.tourUuid) || null;
    const shows = useQuery(Show, (query) => query.filtered('tourUuid == $0', this.tourUuid), [
      this.tourUuid,
    ]);

    const obj = useMemo(() => {
      return { tour, shows };
    }, [tour, shows]);

    return obj;
  }

  isLocalDataShowable(localData: TourShows): boolean {
    return localData.tour !== null && localData.shows.length > 0;
  }

  upsert(realm: Realm, localData: TourShows, apiData: TourWithShows): void {
    if (!localData.shows.isValid()) {
      return;
    }

    // TODO: Convert this code from year to venue
    const apiVenuesByUuid = R.flatMapToObj(
      apiData.shows.filter((s) => !!s.venue),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      (s) => [[s.venue!.uuid, s.venue!]]
    );

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

export function useTourShows(
  artistUuid: string,
  tourUuid: string
): NetworkBackedResults<TourShows> {
  const behavior = useMemo(() => {
    return new TourShowsNetworkBackedBehavior(artistUuid, tourUuid);
  }, [artistUuid, tourUuid]);

  return useNetworkBackedBehavior(behavior);
}

export const useArtistTourShows = (artistUuid: string, tourUuid: string) => {
  const artistResults = useArtist(artistUuid, { onlyFetchFromApiIfLocalIsNotShowable: true });
  const tourShowResults = useTourShows(artistUuid, tourUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      tourShows: tourShowResults,
      artist: artistResults,
    });
  }, [tourShowResults, artistResults]);

  return results;
};
