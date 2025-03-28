import { useObject, useQuery } from '../../schema';
import { useNetworkBackedBehavior } from '../../network_backed_behavior_hooks';
import { useArtist } from '../artist_repo';
import { mergeNetworkBackedResults, NetworkBackedResults } from '../../network_backed_results';
import { useMemo } from 'react';
import { Tour } from '../tour';
import { TourWithShows } from '@/relisten/api/models/tour';
import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import {
  NetworkBackedBehaviorOptions,
  ThrottledNetworkBackedBehavior,
} from '../../network_backed_behavior';
import { Show } from '../show';
import { tourRepo } from '../tour_repo';
import Realm from 'realm';
import { upsertShowList } from '@/relisten/realm/models/repo_utils';

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

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<TourWithShows>> {
    return api.tour(this.artistUuid, this.tourUuid, api.refreshOptions(forcedRefresh));
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

    realm.write(() => {
      upsertShowList(realm, apiData.shows, localData.shows, {
        // we may not have all the shows here on initial load
        performDeletes: false,
        queryForModel: true,
        upsertModels: {
          // every tour is the same, so just do it once here
          tours: false,
        },
      });

      tourRepo.upsert(realm, apiData, localData.tour || undefined);
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
