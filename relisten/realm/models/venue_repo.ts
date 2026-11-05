import { indexRows, uuidRows } from '../catalog_projection';
import { Artist } from './artist';
import type { RelistenApiClient } from '@/relisten/api/client';
import { decodeUuidCatalogId, encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type { ArtistVenueEntryResource } from '@/relisten/api/catalog/resources';
import {
  NetworkBackedBehavior,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import { mergeNetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { RealmObjectValueStream, ValueStream } from '@/relisten/realm/value_streams';
import { useMemo } from 'react';
import Realm from 'realm';
import { applyArtistVenues } from '../catalog_apply';
import { useQuery, useRealm } from '../schema';
import { ensureCatalogArtist, useArtist } from './artist_repo';
import { ArtistVenue, CatalogQueryState } from './catalog';
import { Venue } from './venue';

export type ArtistVenueBrowseItem =
  | { uuid: string; kind: 'artist_venue'; artistVenue: ArtistVenue }
  | { uuid: string; kind: 'imported_venue'; importedVenue: Venue };

function artistVenuesQueryKey(artistUuid: string) {
  return `GET /artists/${encodeUuidCatalogId(artistUuid, 'artist')}/venues`;
}

function projectArtistVenueBrowseItems(
  state: CatalogQueryState | null,
  keys: readonly string[],
  artistVenues: ArrayLike<ArtistVenue>,
  importedVenues: ArrayLike<Venue>
): ArtistVenueBrowseItem[] {
  if (state?.hasAppliedData !== true) {
    return [];
  }
  const artistVenuesById = indexRows(artistVenues, (venue) => venue.id);
  const importedVenuesById = indexRows(importedVenues, (venue) => venue.uuid);
  const items: ArtistVenueBrowseItem[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const id = state.resultIds[index];
    if (id.startsWith('artist_venue_')) {
      const artistVenue = artistVenuesById.get(keys[index]);
      if (artistVenue) {
        items.push({ uuid: id, kind: 'artist_venue', artistVenue });
      }
    } else if (id.startsWith('imported_venue_')) {
      const importedVenue = importedVenuesById.get(keys[index]);
      if (importedVenue) {
        items.push({ uuid: id, kind: 'imported_venue', importedVenue });
      }
    }
  }
  return items;
}

export class ArtistVenuesNetworkBackedBehavior extends NetworkBackedBehavior<
  CatalogQueryState | null,
  ArtistVenueEntryResource[]
> {
  constructor(
    realm: Realm,
    private readonly artistUuid: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  get queryKey() {
    return artistVenuesQueryKey(this.artistUuid);
  }

  createLocalUpdatingResults(): ValueStream<CatalogQueryState | null> {
    return new RealmObjectValueStream(this.realm, CatalogQueryState, this.queryKey);
  }

  async fetchFromApi(api: RelistenApiClient, _force: boolean, etag?: string) {
    await ensureCatalogArtist(this.realm, api, this.artistUuid);
    return api.venues(this.artistUuid, { etag });
  }

  isLocalDataShowable(state: CatalogQueryState | null) {
    return state?.hasAppliedData === true;
  }

  hasLocalData() {
    return this.realm.objectForPrimaryKey(Artist, this.artistUuid) !== null;
  }

  upsert(_state: CatalogQueryState | null, resources: ArtistVenueEntryResource[]) {
    return applyArtistVenues(this.realm, this.artistUuid, resources);
  }
}

export function useVenues(artistUuid: string, options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();
  const behavior = useMemo(
    () => new ArtistVenuesNetworkBackedBehavior(realm, artistUuid, options),
    [realm, artistUuid, options]
  );
  const results = useNetworkBackedBehavior(behavior);
  const keys = useMemo(() => {
    const keys: string[] = [];
    if (results.data?.hasAppliedData) {
      const ids = results.data.resultIds;
      for (let index = 0; index < ids.length; index += 1) {
        const id = ids[index];
        keys.push(
          id.startsWith('imported_venue_') ? decodeUuidCatalogId(id, 'imported_venue') : id
        );
      }
    }
    return keys;
  }, [results.data]);
  const artistVenues = useQuery(
    ArtistVenue,
    (query) => query.filtered('id IN $0 AND artistUuid == $1', keys, artistUuid),
    [artistUuid, keys]
  );
  const importedVenues = useQuery(
    Venue,
    (query) => uuidRows(query, keys).filtered('artistUuid == $0', artistUuid),
    [artistUuid, keys]
  );
  const data = useMemo(
    () => projectArtistVenueBrowseItems(results.data, keys, artistVenues, importedVenues),
    [artistVenues, importedVenues, keys, results.data]
  );

  return useMemo(() => {
    const resultIds = results.data?.resultIds;
    const hasCompleteAppliedProjection =
      results.data?.hasAppliedData === true &&
      resultIds !== undefined &&
      data.length === resultIds.length;

    return {
      ...results,
      data,
      errors: hasCompleteAppliedProjection ? undefined : results.errors,
    };
  }, [data, results]);
}

export const useArtistVenues = (artistUuid: string) => {
  const artistResults = useArtist(artistUuid);
  const venuesResults = useVenues(artistUuid);

  return useMemo(
    () => mergeNetworkBackedResults({ venues: venuesResults, artist: artistResults }),
    [venuesResults, artistResults]
  );
};
