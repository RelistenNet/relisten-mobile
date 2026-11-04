import type { RelistenApiClient } from '@/relisten/api/client';
import { decodeV4UuidCatalogId, encodeV4UuidCatalogId } from '@/relisten/api/v4/catalog_identity';
import type { V4TourWithShowsResource } from '@/relisten/api/v4/wire_types';
import { useMemo } from 'react';
import Realm from 'realm';
import { NetworkBackedBehavior, NetworkBackedBehaviorOptions } from '../../network_backed_behavior';
import { useNetworkBackedBehavior } from '../../network_backed_behavior_hooks';
import { mergeNetworkBackedResults, NetworkBackedResults } from '../../network_backed_results';
import { useRealm } from '../../schema';
import { applyV4Tour } from '../../v4_catalog_apply';
import {
  CombinedValueStream,
  RealmObjectValueStream,
  RealmQueryValueStream,
} from '../../value_streams';
import { ensureCatalogArtist, useArtist } from '../artist_repo';
import { Show } from '../show';
import { Tour } from '../tour';
import { CatalogQueryState } from '../v4_catalog';

export interface TourShows {
  tour: Tour | null;
  shows: Show[];
  hasAppliedData: boolean;
}

export class TourShowsNetworkBackedBehavior extends NetworkBackedBehavior<
  TourShows,
  V4TourWithShowsResource
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
    return `GET /tours/${encodeV4UuidCatalogId(this.tourUuid, 'tour')}`;
  }

  async fetchFromApi(api: RelistenApiClient, _force: boolean, etag?: string) {
    await ensureCatalogArtist(this.realm, api, this.artistUuid);
    return api.tour(this.tourUuid, { etag });
  }

  createLocalUpdatingResults() {
    const state = new RealmObjectValueStream(this.realm, CatalogQueryState, this.queryKey);
    const rows = new RealmQueryValueStream(
      this.realm,
      this.realm.objects(Show).filtered('tourUuid == $0 && deletedAt == nil', this.tourUuid)
    );

    return new CombinedValueStream(state, rows, (query) => {
      const tour = this.realm.objectForPrimaryKey(Tour, this.tourUuid);
      const ids = query?.hasAppliedData ? [...query.resultIds].slice(1) : [];
      const shows = ids.flatMap((id) => {
        const show = this.realm.objectForPrimaryKey(Show, decodeV4UuidCatalogId(id, 'show'));
        return show && show.deletedAt == null && show.tourUuid === this.tourUuid ? [show] : [];
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

  hasLocalData(data: TourShows, resultIds: Iterable<string>) {
    const [rootId] = resultIds;
    return (
      rootId === encodeV4UuidCatalogId(this.tourUuid, 'tour') &&
      data.tour?.artistUuid === this.artistUuid &&
      data.hasAppliedData
    );
  }

  upsert(_data: TourShows, resource: V4TourWithShowsResource) {
    if (resource.id !== encodeV4UuidCatalogId(this.tourUuid, 'tour')) {
      throw new Error('Unexpected tour identity.');
    }
    return applyV4Tour(this.realm, this.artistUuid, resource);
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
