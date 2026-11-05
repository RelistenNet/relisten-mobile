import { saveCatalogResults } from '../../catalog_projection';
import type { RelistenApiClient } from '@/relisten/api/client';
import { decodeUuidCatalogId, encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
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
import { CatalogQueryState } from '../catalog';

export interface TourShows {
  tour: Tour | null;
  shows: Show[];
  hasAppliedData: boolean;
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

  get queryKey() {
    return `GET /tours/${encodeUuidCatalogId(this.tourUuid, 'tour')}`;
  }

  async fetchFromApi(api: RelistenApiClient, force: boolean) {
    await ensureCatalogArtist(this.realm, api, this.artistUuid);
    return api.tour(this.tourUuid, { force });
  }

  createLocalUpdatingResults() {
    const state = new RealmObjectValueStream(this.realm, CatalogQueryState, this.queryKey);
    const tour = new RealmObjectValueStream(this.realm, Tour, this.tourUuid);
    const detail = new CombinedValueStream(state, tour, (query, tour) => ({ query, tour }));
    const rows = new RealmQueryValueStream(
      this.realm,
      this.realm.objects(Show).filtered('artistUuid == $0 && deletedAt == nil', this.artistUuid)
    );

    return new CombinedValueStream(detail, rows, ({ query, tour }) => {
      const ids = query?.hasAppliedData ? [...query.resultIds].slice(1) : [];
      const shows = ids.flatMap((id) => {
        const show = this.realm.objectForPrimaryKey(Show, decodeUuidCatalogId(id, 'show'));
        return show && show.deletedAt == null ? [show] : [];
      });

      return {
        tour: tour?.deletedAt == null ? tour : null,
        shows,
        hasAppliedData: query?.hasAppliedData === true && shows.length === ids.length,
      };
    });
  }

  isLocalDataShowable(data: TourShows) {
    return data.tour !== null && data.hasAppliedData;
  }

  upsert(_data: TourShows, resource: TourWithShowsResource) {
    if (resource.id !== encodeUuidCatalogId(this.tourUuid, 'tour')) {
      throw new Error('Unexpected tour identity.');
    }
    return saveCatalogResults(
      this.realm,
      this.queryKey,
      applyTourDetail(this.realm, this.artistUuid, resource)
    );
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
