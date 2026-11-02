import type { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import { useRelistenApi } from '@/relisten/api/context';
import type { VenueWithShowCounts } from '@/relisten/api/models/venue';
import { decodeV4UuidCatalogId, encodeV4UuidCatalogId } from '@/relisten/api/v4/catalog_identity';
import { NetworkBackedBehaviorOptions } from '@/relisten/realm/network_backed_behavior';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import { mergeNetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { ThrottledNetworkBackedBehavior } from '@/relisten/realm/throttled_network_backed_behavior';
import {
  MappedValueStream,
  RealmObjectValueStream,
  RealmQueryValueStream,
  ValueStream,
} from '@/relisten/realm/value_streams';
import { useMemo } from 'react';
import Realm from 'realm';

import { Repository } from '../repository';
import { useQuery, useRealm } from '../schema';
import { useArtist } from './artist_repo';
import { Venue } from './venue';
import { ArtistVenue, CatalogQueryState } from './v4_catalog';

export const venueRepo = new Repository(Venue);

export type ArtistVenueBrowseItem =
  | { uuid: string; kind: 'artist_venue'; artistVenue: ArtistVenue }
  | { uuid: string; kind: 'imported_venue'; importedVenue: Venue };

interface ArtistVenuesLocalData {
  queryState: CatalogQueryState | null;
  venues: Realm.Results<Venue> | null;
}

function artistVenuesQueryKey(artistUuid: string) {
  return `GET /artists/${encodeV4UuidCatalogId(artistUuid, 'artist')}/venues`;
}

function projectArtistVenueBrowseItems(
  useV4: boolean,
  state: CatalogQueryState | null,
  artistVenues: ReadonlyArray<ArtistVenue>,
  importedVenues: ReadonlyArray<Venue>
): ArtistVenueBrowseItem[] {
  if (!useV4) {
    return importedVenues.map((importedVenue) => ({
      uuid: importedVenue.uuid,
      kind: 'imported_venue',
      importedVenue,
    }));
  }

  if (state?.hasAppliedData !== true) return [];

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

class ArtistVenuesNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  ArtistVenuesLocalData,
  VenueWithShowCounts[]
> {
  constructor(
    realm: Realm,
    private readonly artistUuid: string,
    private readonly useV4: boolean,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  override createLocalUpdatingResults(): ValueStream<ArtistVenuesLocalData> {
    if (this.useV4) {
      return new MappedValueStream<CatalogQueryState | null, ArtistVenuesLocalData>(
        new RealmObjectValueStream(
          this.realm,
          CatalogQueryState,
          artistVenuesQueryKey(this.artistUuid)
        ),
        (queryState) => ({ queryState, venues: null })
      );
    }

    return new MappedValueStream<Realm.Results<Venue>, ArtistVenuesLocalData>(
      new RealmQueryValueStream(
        this.realm,
        this.realm
          .objects(Venue)
          .filtered('artistUuid == $0 && showsAtVenue > 0 && deletedAt == nil', this.artistUuid)
      ),
      (venues) => ({ queryState: null, venues })
    );
  }

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<VenueWithShowCounts[]>> {
    return this.useV4
      ? api.refreshV4ArtistVenues(this.artistUuid, forcedRefresh)
      : api.venues(this.artistUuid, api.refreshOptions(forcedRefresh));
  }

  isLocalDataShowable(localData: ArtistVenuesLocalData): boolean {
    return this.useV4
      ? localData.queryState?.hasAppliedData === true
      : (localData.venues?.length ?? 0) > 0;
  }

  override upsert(localData: ArtistVenuesLocalData, apiData: VenueWithShowCounts[]): void {
    if (this.useV4 || !localData.venues) return;
    venueRepo.upsertMultiple(this.realm, apiData, localData.venues, true, true);
  }
}

export function useVenues(artistUuid: string, options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();
  const { apiClient } = useRelistenApi();
  const useV4 = apiClient.usesV4Catalog();
  const artistVenues = useQuery(
    ArtistVenue,
    (query) => query.filtered('artistUuid == $0', artistUuid),
    [artistUuid]
  );
  const importedVenues = useQuery(
    Venue,
    (query) =>
      useV4
        ? query.filtered('artistUuid == $0 && deletedAt == nil', artistUuid)
        : query.filtered('artistUuid == $0 && showsAtVenue > 0 && deletedAt == nil', artistUuid),
    [artistUuid, useV4]
  );
  const behavior = useMemo(
    () => new ArtistVenuesNetworkBackedBehavior(realm, artistUuid, useV4, options),
    [realm, artistUuid, useV4, options]
  );
  const results = useNetworkBackedBehavior(behavior);
  const data = useMemo(
    () =>
      projectArtistVenueBrowseItems(
        useV4,
        results.data.queryState,
        [...artistVenues],
        useV4 ? [...importedVenues] : [...(results.data.venues ?? [])]
      ),
    [artistVenues, importedVenues, results.data, useV4]
  );

  return useMemo(() => {
    const resultIds = results.data.queryState?.resultIds;
    const hasCompleteAppliedProjection =
      results.data.queryState?.hasAppliedData === true &&
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
