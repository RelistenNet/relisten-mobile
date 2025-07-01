import { useNetworkBackedBehavior } from '../../network_backed_behavior_hooks';
import { useArtist } from '../artist_repo';
import { mergeNetworkBackedResults, NetworkBackedResults } from '../../network_backed_results';
import { useMemo } from 'react';
import { Tour } from '../tour';
import { TourWithShows } from '@/relisten/api/models/tour';
import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import { NetworkBackedBehaviorOptions } from '../../network_backed_behavior';
import { Show } from '../show';
import { tourRepo } from '../tour_repo';
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

export interface TourShows {
  tour: Tour | null;
  shows: Realm.Results<Show>;
}

class TourShowsNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  TourShows,
  TourWithShows
> {
  constructor(
    realm: Realm.Realm,
    public artistUuid: string,
    public tourUuid: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<TourWithShows>> {
    return api.tour(this.artistUuid, this.tourUuid, api.refreshOptions(forcedRefresh));
  }

  override createLocalUpdatingResults(): ValueStream<TourShows> {
    const tourResults = new RealmObjectValueStream(this.realm, Tour, this.tourUuid);
    const showsResults = new RealmQueryValueStream<Show>(
      this.realm,
      this.realm.objects(Show).filtered('tourUuid == $0', this.tourUuid)
    );

    return new CombinedValueStream(tourResults, showsResults, (tour, shows) => {
      return { tour, shows };
    });
  }

  isLocalDataShowable(localData: TourShows): boolean {
    return localData.tour !== null && localData.shows.length > 0;
  }

  override upsert(localData: TourShows, apiData: TourWithShows): void {
    if (!localData.shows.isValid()) {
      return;
    }

    this.realm.write(() => {
      upsertShowList(this.realm, apiData.shows, localData.shows, {
        // we may not have all the shows here on initial load
        performDeletes: false,
        queryForModel: true,
        upsertModels: {
          // every tour is the same, so just do it once here
          tours: false,
        },
      });

      tourRepo.upsert(this.realm, apiData, localData.tour || undefined);
    });
  }
}

export function useTourShows(
  artistUuid: string,
  tourUuid: string
): NetworkBackedResults<TourShows> {
  const realm = useRealm();
  const behavior = useMemo(() => {
    return new TourShowsNetworkBackedBehavior(realm, artistUuid, tourUuid);
  }, [realm, artistUuid, tourUuid]);

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
