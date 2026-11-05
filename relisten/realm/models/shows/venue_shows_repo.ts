import { detailRowUuids, orderedUuidRows, uuidRows } from '../../catalog_projection';
import { Artist } from '../artist';
import { RelistenApiClient } from '@/relisten/api/client';
import { encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type {
  ArtistVenueWithShowsResource,
  ImportedVenueWithShowsResource,
  VenueWithShowsResource,
} from '@/relisten/api/catalog/resources';
import {
  NetworkBackedBehavior,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import {
  mergeNetworkBackedResults,
  NetworkBackedResults,
} from '@/relisten/realm/network_backed_results';
import { useQuery, useRealm } from '@/relisten/realm/schema';
import { RealmObjectValueStream, ValueStream } from '@/relisten/realm/value_streams';
import { useMemo } from 'react';
import Realm from 'realm';
import {
  applyArtistVenueDetail,
  applyImportedVenueDetail,
  applyVenueDetail,
} from '../../catalog_apply';

import { ensureCatalogArtist, useArtist } from '../artist_repo';
import { Show } from '../show';
import { ArtistVenue, CatalogQueryState, NormalizedVenue } from '../catalog';
import { Venue } from '../venue';

export type VenueDetailKind = 'artist_venue' | 'imported_venue' | 'venue';

export interface VenueShows {
  kind: VenueDetailKind;
  artistVenue?: ArtistVenue;
  importedVenue?: Venue;
  normalizedVenue?: NormalizedVenue;
  shows: Show[];
  hasAppliedData: boolean;
}

type VenueDetailResource =
  | ArtistVenueWithShowsResource
  | ImportedVenueWithShowsResource
  | VenueWithShowsResource;

function venueDetailQueryKey(
  kind: VenueDetailKind,
  artistUuid: string | undefined,
  venueId: string
) {
  switch (kind) {
    case 'artist_venue':
      return `GET /artists/${encodeUuidCatalogId(artistUuid!, 'artist')}/venues/${venueId}`;
    case 'imported_venue':
      return `GET /imported-venues/${encodeUuidCatalogId(venueId, 'imported_venue')}`;
    case 'venue':
      return `GET /venues/${venueId}`;
  }
}

export class VenueShowsNetworkBackedBehavior extends NetworkBackedBehavior<
  CatalogQueryState | null,
  VenueDetailResource
> {
  constructor(
    realm: Realm,
    private readonly kind: VenueDetailKind,
    private readonly artistUuid: string | undefined,
    private readonly venueId: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  get queryKey() {
    return venueDetailQueryKey(this.kind, this.artistUuid, this.venueId);
  }

  createLocalUpdatingResults(): ValueStream<CatalogQueryState | null> {
    return new RealmObjectValueStream(this.realm, CatalogQueryState, this.queryKey);
  }

  async fetchFromApi(api: RelistenApiClient, _force: boolean, etag?: string) {
    await ensureCatalogArtist(this.realm, api, this.artistUuid);
    switch (this.kind) {
      case 'artist_venue':
        return api.artistVenue(this.artistUuid!, this.venueId, { etag });
      case 'imported_venue':
        return api.importedVenue(this.venueId, { etag });
      case 'venue':
        return api.venue(this.venueId, { etag });
    }
  }

  isLocalDataShowable(state: CatalogQueryState | null) {
    return state?.hasAppliedData === true;
  }

  hasLocalData(_state: CatalogQueryState | null, resultIds: Iterable<string>) {
    const [rootId] = resultIds;
    if (!rootId) {
      return false;
    }
    if (this.artistUuid && this.realm.objectForPrimaryKey(Artist, this.artistUuid) === null) {
      return false;
    }
    switch (this.kind) {
      case 'artist_venue':
        return this.realm.objectForPrimaryKey(ArtistVenue, rootId) !== null;
      case 'imported_venue':
        return this.realm.objectForPrimaryKey(Venue, this.venueId) !== null;
      case 'venue':
        return this.realm.objectForPrimaryKey(NormalizedVenue, rootId) !== null;
    }
  }

  upsert(_state: CatalogQueryState | null, resource: VenueDetailResource) {
    if (this.kind === 'artist_venue' && 'venue' in resource) {
      return applyArtistVenueDetail(this.realm, this.artistUuid!, resource);
    }

    if (
      this.kind === 'imported_venue' &&
      'upstream_identifier' in resource &&
      resource.id === encodeUuidCatalogId(this.venueId, 'imported_venue')
    ) {
      return applyImportedVenueDetail(this.realm, this.artistUuid!, resource);
    }

    if (this.kind === 'venue' && 'global_show_count' in resource) {
      return applyVenueDetail(this.realm, resource);
    }

    throw new Error('Unexpected venue detail identity or kind.');
  }
}

function useVenueDetail(
  artistUuid: string | undefined,
  venueId: string,
  kind: VenueDetailKind
): NetworkBackedResults<VenueShows> {
  const realm = useRealm();
  const behavior = useMemo(
    () => new VenueShowsNetworkBackedBehavior(realm, kind, artistUuid, venueId),
    [artistUuid, kind, realm, venueId]
  );
  const results = useNetworkBackedBehavior(behavior);
  const rootId = results.data?.hasAppliedData ? results.data.resultIds[0] : undefined;
  const artistVenues = useQuery(
    ArtistVenue,
    (query) => query.filtered('id == $0', kind === 'artist_venue' ? (rootId ?? '') : ''),
    [kind, rootId]
  );
  const artistVenue = artistVenues[0];
  const importedVenues = useQuery(
    Venue,
    (query) =>
      query.filtered(
        'uuid == $0 AND deletedAt == nil',
        kind === 'imported_venue' && rootId ? venueId : ''
      ),
    [kind, rootId, venueId]
  );
  const normalizedVenueId = kind === 'venue' ? rootId : artistVenue?.venueId;
  const normalizedVenues = useQuery(
    NormalizedVenue,
    (query) => query.filtered('id == $0', normalizedVenueId ?? ''),
    [normalizedVenueId]
  );
  const uuids = useMemo(() => detailRowUuids(results.data, 'show'), [results.data]);
  const shows = useQuery(
    Show,
    (query) => {
      const selected = uuidRows(query, uuids);
      return artistUuid ? selected.filtered('artistUuid == $0', artistUuid) : selected;
    },
    [artistUuid, uuids]
  );
  const data = useMemo<VenueShows>(() => {
    const ordered = orderedUuidRows(shows, uuids);
    const hasAppliedData =
      results.data?.hasAppliedData === true && ordered.length === results.data.resultIds.length - 1;
    const importedVenue = importedVenues[0];
    const normalizedVenue = normalizedVenues[0];
    switch (kind) {
      case 'artist_venue':
        return {
          kind,
          artistVenue,
          normalizedVenue,
          shows: ordered,
          hasAppliedData: hasAppliedData && artistVenue !== undefined,
        };
      case 'imported_venue':
        return {
          kind,
          importedVenue,
          shows: ordered,
          hasAppliedData: hasAppliedData && importedVenue !== undefined,
        };
      case 'venue':
        return {
          kind,
          normalizedVenue,
          shows: ordered,
          hasAppliedData: hasAppliedData && normalizedVenue !== undefined,
        };
    }
  }, [artistVenue, importedVenues, kind, normalizedVenues, results.data, shows, uuids]);

  return { ...results, data };
}

export function useVenueShows(
  artistUuid: string,
  venueId: string,
  kind?: Exclude<VenueDetailKind, 'venue'>
) {
  const effectiveKind = kind ?? (venueId.startsWith('venue_') ? 'artist_venue' : 'imported_venue');
  return useVenueDetail(artistUuid, venueId, effectiveKind);
}

export const useArtistVenueShows = (
  artistUuid: string,
  venueId: string,
  kind?: Exclude<VenueDetailKind, 'venue'>
) => {
  const artistResults = useArtist(artistUuid);
  const venueResults = useVenueShows(artistUuid, venueId, kind);

  return useMemo(
    () => mergeNetworkBackedResults({ venue: venueResults, artist: artistResults }),
    [venueResults, artistResults]
  );
};

export function useGlobalVenueShows(venueId: string) {
  return useVenueDetail(undefined, venueId, 'venue');
}
