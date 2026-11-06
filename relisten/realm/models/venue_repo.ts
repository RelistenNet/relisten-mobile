import type { RelistenApiClient } from '@/relisten/api/client';
import type { ArtistVenueEntryResource } from '@/relisten/api/catalog/resources';
import { useMemo } from 'react';
import Realm from 'realm';
import { applyArtistVenues } from '../catalog_apply';
import { NetworkBackedBehavior, NetworkBackedBehaviorOptions } from '../network_backed_behavior';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { mergeNetworkBackedResults } from '../network_backed_results';
import { useRealm } from '../schema';
import { CombinedValueStream, RealmQueryValueStream } from '../value_streams';
import { ArtistVenue } from './catalog';
import { ensureCatalogArtist, useArtist } from './artist_repo';
import { Venue } from './venue';
import { VenueItem } from './venue_view';

export class ArtistVenuesNetworkBackedBehavior extends NetworkBackedBehavior<
  VenueItem[],
  ArtistVenueEntryResource[]
> {
  constructor(
    realm: Realm,
    private readonly artistUuid: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }
  createLocalUpdatingResults() {
    const normalized = new RealmQueryValueStream(
      this.realm,
      this.realm
        .objects(ArtistVenue)
        .filtered('artistUuid == $0 AND deletedAt == nil', this.artistUuid)
    );
    const imported = new RealmQueryValueStream(
      this.realm,
      this.realm
        .objects(Venue)
        .filtered('artistUuid == $0 AND deletedAt == nil AND showsAtVenue > 0', this.artistUuid)
    );
    return new CombinedValueStream(normalized, imported, (normalized, imported) =>
      [...normalized, ...imported].map((row) => new VenueItem(row))
    );
  }
  async fetchFromApi(api: RelistenApiClient, force: boolean) {
    await ensureCatalogArtist(this.realm, api, this.artistUuid);
    return api.venues(this.artistUuid, { force });
  }
  isLocalDataShowable(data: VenueItem[]) {
    return data.length > 0;
  }
  upsert(_data: VenueItem[], resources: ArtistVenueEntryResource[]) {
    applyArtistVenues(this.realm, this.artistUuid, resources);
  }
}

export function useVenues(artistUuid: string, options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();
  const behavior = useMemo(
    () => new ArtistVenuesNetworkBackedBehavior(realm, artistUuid, options),
    [realm, artistUuid, options]
  );
  return useNetworkBackedBehavior(behavior);
}
export function useArtistVenues(artistUuid: string) {
  const venues = useVenues(artistUuid);
  const artist = useArtist(artistUuid);
  return useMemo(() => mergeNetworkBackedResults({ venues, artist }), [venues, artist]);
}
