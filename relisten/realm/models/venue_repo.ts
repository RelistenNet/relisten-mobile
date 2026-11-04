import type { RelistenApiClient } from '@/relisten/api/client';
import { decodeV4UuidCatalogId, encodeV4UuidCatalogId } from '@/relisten/api/v4/catalog_identity';
import type { V4ArtistVenueEntryResource } from '@/relisten/api/v4/wire_types';
import {
  NetworkBackedBehavior,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import { mergeNetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { RealmObjectValueStream, ValueStream } from '@/relisten/realm/value_streams';
import { useMemo } from 'react';
import Realm from 'realm';
import { applyV4ArtistVenues, hasV4ArtistVenues } from '../v4_catalog_apply';
import { useQuery, useRealm } from '../schema';
import { ensureCatalogArtist, useArtist } from './artist_repo';
import { ArtistVenue, CatalogQueryState } from './v4_catalog';
import { Venue } from './venue';

export type ArtistVenueBrowseItem =
  | { uuid: string; kind: 'artist_venue'; artistVenue: ArtistVenue }
  | { uuid: string; kind: 'imported_venue'; importedVenue: Venue };

function artistVenuesQueryKey(artistUuid: string) {
  return `GET /artists/${encodeV4UuidCatalogId(artistUuid, 'artist')}/venues`;
}

function projectArtistVenueBrowseItems(
  state: CatalogQueryState | null,
  artistVenues: ReadonlyArray<ArtistVenue>,
  importedVenues: ReadonlyArray<Venue>
): ArtistVenueBrowseItem[] {
  if (state?.hasAppliedData !== true) {
    return [];
  }

  const artistVenuesById = new Map(artistVenues.map((venue) => [venue.id, venue]));
  const importedVenuesById = new Map(importedVenues.map((venue) => [venue.uuid, venue]));

  return [...state.resultIds].flatMap((resultId): ArtistVenueBrowseItem[] => {
    if (resultId.startsWith('artist_venue_')) {
      const artistVenue = artistVenuesById.get(resultId);
      return artistVenue ? [{ uuid: resultId, kind: 'artist_venue', artistVenue }] : [];
    }

    if (resultId.startsWith('imported_venue_')) {
      const importedVenue = importedVenuesById.get(
        decodeV4UuidCatalogId(resultId, 'imported_venue')
      );
      return importedVenue ? [{ uuid: resultId, kind: 'imported_venue', importedVenue }] : [];
    }

    return [];
  });
}

export class ArtistVenuesNetworkBackedBehavior extends NetworkBackedBehavior<
  CatalogQueryState | null,
  V4ArtistVenueEntryResource[]
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

  hasLocalData(_state: CatalogQueryState | null, resultIds: Iterable<string>) {
    return hasV4ArtistVenues(this.realm, this.artistUuid, resultIds);
  }

  upsert(_state: CatalogQueryState | null, resources: V4ArtistVenueEntryResource[]) {
    return applyV4ArtistVenues(this.realm, this.artistUuid, resources);
  }
}

export function useVenues(artistUuid: string, options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();
  const artistVenues = useQuery(
    ArtistVenue,
    (query) => query.filtered('artistUuid == $0', artistUuid),
    [artistUuid]
  );
  const importedVenues = useQuery(
    Venue,
    (query) => query.filtered('artistUuid == $0 && deletedAt == nil', artistUuid),
    [artistUuid]
  );
  const behavior = useMemo(
    () => new ArtistVenuesNetworkBackedBehavior(realm, artistUuid, options),
    [realm, artistUuid, options]
  );
  const results = useNetworkBackedBehavior(behavior);
  const data = useMemo(
    () => projectArtistVenueBrowseItems(results.data, [...artistVenues], [...importedVenues]),
    [artistVenues, importedVenues, results.data]
  );

  return useMemo(() => {
    const resultIds = results.data?.resultIds;
    const hasCompleteAppliedProjection =
      results.data?.hasAppliedData === true &&
      resultIds !== undefined &&
      new Set(resultIds).size === resultIds.length &&
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
