import { Artist } from './artist';
import type { RelistenApiClient } from '@/relisten/api/client';
import { encodeV4UuidCatalogId } from '@/relisten/api/v4/catalog_identity';
import type { V4TourResource } from '@/relisten/api/v4/wire_types';
import { useMemo } from 'react';
import Realm from 'realm';
import { NetworkBackedBehavior, NetworkBackedBehaviorOptions } from '../network_backed_behavior';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { mergeNetworkBackedResults } from '../network_backed_results';
import { useRealm } from '../schema';
import { applyV4ArtistTours } from '../v4_catalog_apply';
import { RealmQueryValueStream } from '../value_streams';
import { ensureCatalogArtist, useArtist } from './artist_repo';
import { Tour } from './tour';
import { CatalogQueryState } from './v4_catalog';

export class ToursNetworkBackedBehavior extends NetworkBackedBehavior<
  Realm.Results<Tour>,
  V4TourResource[]
> {
  constructor(
    realm: Realm,
    private readonly artistUuid: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  get queryKey() {
    return `GET /artists/${encodeV4UuidCatalogId(this.artistUuid, 'artist')}/tours`;
  }

  createLocalUpdatingResults() {
    const tours = this.realm
      .objects(Tour)
      .filtered('artistUuid == $0 && deletedAt == nil', this.artistUuid);
    return new RealmQueryValueStream(this.realm, tours);
  }

  async fetchFromApi(api: RelistenApiClient, _force: boolean, etag?: string) {
    await ensureCatalogArtist(this.realm, api, this.artistUuid);
    return api.tours(this.artistUuid, { etag });
  }

  isLocalDataShowable(data: Realm.Results<Tour>) {
    return (
      data.length > 0 ||
      this.realm.objectForPrimaryKey(CatalogQueryState, this.queryKey)?.hasAppliedData === true
    );
  }

  hasLocalData() {
    return this.realm.objectForPrimaryKey(Artist, this.artistUuid) !== null;
  }

  upsert(_data: Realm.Results<Tour>, resources: V4TourResource[]) {
    return applyV4ArtistTours(this.realm, this.artistUuid, resources);
  }
}

export function useTours(artistUuid: string, options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();
  const behavior = useMemo(
    () => new ToursNetworkBackedBehavior(realm, artistUuid, options),
    [realm, artistUuid, options]
  );
  return useNetworkBackedBehavior(behavior);
}

export const useArtistTours = (artistUuid: string) => {
  const artist = useArtist(artistUuid);
  const tours = useTours(artistUuid);
  return useMemo(() => mergeNetworkBackedResults({ tours, artist }), [tours, artist]);
};
