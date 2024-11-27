import { useObject, useQuery } from '../../schema';
import { useNetworkBackedBehavior } from '../../network_backed_behavior_hooks';
import { useArtist } from '../artist_repo';
import { NetworkBackedResults, mergeNetworkBackedResults } from '../../network_backed_results';
import { useMemo } from 'react';
import { Tour } from '../tour';
import { TourWithShows } from '@/relisten/api/models/tour';
import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import {
  ThrottledNetworkBackedBehavior,
  NetworkBackedBehaviorOptions,
} from '../../network_backed_behavior';
import { Show } from '../show';
import { showRepo } from '../show_repo';
import { tourRepo } from '../tour_repo';
import Realm from 'realm';
import * as R from 'remeda';

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
    public tourUuid: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(options);
  }

  fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<TourWithShows>> {
    return api.tour(this.artistUuid, this.tourUuid);
  }

  useFetchFromLocal(): TourShows {
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

    const apiToursByUuid = R.fromEntries(
      R.flatMap(
        apiData.shows.filter((s) => !!s.tour),

        (s) => [[s.tour!.uuid, s.tour!]]
      )
    );

    realm.write(() => {
      const { createdModels: createdShows } = showRepo.upsertMultiple(
        realm,
        apiData.shows,
        localData.shows,
        /* performDeletes= */ false
      );

      for (const show of createdShows.concat(localData.shows)) {
        if (show.tourUuid) {
          const apiTour = apiToursByUuid[show.tourUuid];

          if (!show.tour) {
            const localTour = realm.objectForPrimaryKey(Tour, show.tourUuid);

            if (localTour) {
              show.tour = localTour;
            } else {
              const { createdModels: createdTours } = tourRepo.upsert(realm, apiTour, undefined);

              if (createdTours.length > 0) {
                show.tour = createdTours[0];
              }
            }
          } else {
            tourRepo.upsert(realm, apiTour, show.tour);
          }
        }
      }
    });
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
  const artistResults = useArtist(artistUuid);
  const tourResults = useTourShows(artistUuid, tourUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      tour: tourResults,
      artist: artistResults,
    });
  }, [tourResults, artistResults]);

  return results;
};
