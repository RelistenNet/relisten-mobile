import type { RelistenApiClient } from '@/relisten/api/client';
import { encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type { TourWithShowsResource } from '@/relisten/api/catalog/resources';
import { useMemo } from 'react';
import Realm from 'realm';
import { NetworkBackedBehavior, NetworkBackedBehaviorOptions } from '../../network_backed_behavior';
import { useNetworkBackedBehavior } from '../../network_backed_behavior_hooks';
import { mergeNetworkBackedResults, NetworkBackedResults } from '../../network_backed_results';
import { useRealm } from '../../schema';
import { applyTourDetail } from '../../catalog_apply';
import {
  CombinedValueStream,
  RealmObjectValueStream,
  RealmQueryValueStream,
} from '../../value_streams';
import { ensureCatalogArtist, useArtist } from '../artist_repo';
import { Show } from '../show';
import { Tour } from '../tour';

export interface TourShows {
  tour: Tour | null;
  shows: Show[];
}

export class TourShowsNetworkBackedBehavior extends NetworkBackedBehavior<
  TourShows,
  TourWithShowsResource
> {
  constructor(
    realm: Realm,
    private readonly artistUuid: string,
    private readonly tourUuid: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  async fetchFromApi(api: RelistenApiClient, force: boolean) {
    await ensureCatalogArtist(this.realm, api, this.artistUuid);
    return api.tour(this.tourUuid, { force });
  }

  createLocalUpdatingResults() {
    const tour = new RealmObjectValueStream(this.realm, Tour, this.tourUuid);
    const shows = new RealmQueryValueStream(
      this.realm,
      this.realm
        .objects(Show)
        .filtered(
          'artistUuid == $0 AND tourUuid == $1 AND deletedAt == nil',
          this.artistUuid,
          this.tourUuid
        )
    );
    return new CombinedValueStream(tour, shows, (tour, shows) => ({
      tour: tour?.deletedAt == null ? tour : null,
      shows: Array.from(shows),
    }));
  }

  isLocalDataShowable(data: TourShows) {
    return data.tour !== null;
  }

  upsert(_data: TourShows, resource: TourWithShowsResource) {
    if (resource.id !== encodeUuidCatalogId(this.tourUuid, 'tour')) {
      throw new Error('Unexpected tour identity.');
    }
    return applyTourDetail(this.realm, this.artistUuid, resource);
  }
}

export function useTourShows(
  artistUuid: string,
  tourUuid: string
): NetworkBackedResults<TourShows> {
  const realm = useRealm();
  const behavior = useMemo(
    () => new TourShowsNetworkBackedBehavior(realm, artistUuid, tourUuid),
    [realm, artistUuid, tourUuid]
  );
  return useNetworkBackedBehavior(behavior);
}

export const useArtistTourShows = (artistUuid: string, tourUuid: string) => {
  const artist = useArtist(artistUuid);
  const tour = useTourShows(artistUuid, tourUuid);
  return useMemo(() => mergeNetworkBackedResults({ tour, artist }), [tour, artist]);
};
