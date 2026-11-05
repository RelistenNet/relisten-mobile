import { Artist } from '../artist';
import { RelistenApiClient } from '@/relisten/api/client';
import { decodeV4UuidCatalogId, encodeV4UuidCatalogId } from '@/relisten/api/v4/catalog_identity';
import type {
  V4ArtistVenueWithShowsResource,
  V4ImportedVenueWithShowsResource,
  V4VenueWithShowsResource,
} from '@/relisten/api/v4/wire_types';
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
import { applyV4ArtistVenue, applyV4ImportedVenue, applyV4Venue } from '../../v4_catalog_apply';

import { ensureCatalogArtist, useArtist } from '../artist_repo';
import { Show } from '../show';
import { ArtistVenue, CatalogQueryState, NormalizedVenue } from '../v4_catalog';
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
  | V4ArtistVenueWithShowsResource
  | V4ImportedVenueWithShowsResource
  | V4VenueWithShowsResource;

function venueDetailQueryKey(
  kind: VenueDetailKind,
  artistUuid: string | undefined,
  venueId: string
) {
  switch (kind) {
    case 'artist_venue':
      return `GET /artists/${encodeV4UuidCatalogId(artistUuid!, 'artist')}/venues/${venueId}`;
    case 'imported_venue':
      return `GET /imported-venues/${encodeV4UuidCatalogId(venueId, 'imported_venue')}`;
    case 'venue':
      return `GET /venues/${venueId}`;
  }
}

function projectVenueDetail(
  kind: VenueDetailKind,
  venueId: string,
  state: CatalogQueryState | null,
  artistVenues: ReadonlyArray<ArtistVenue>,
  importedVenues: ReadonlyArray<Venue>,
  normalizedVenues: ReadonlyArray<NormalizedVenue>,
  allShows: ReadonlyArray<Show>
): VenueShows {
  if (state?.hasAppliedData !== true || state.resultIds.length === 0) {
    return { kind, shows: [], hasAppliedData: false };
  }

  const rootId = state.resultIds[0];
  const showsById = new Map(allShows.map((show) => [show.uuid, show]));
  const showIds = [...state.resultIds].slice(1);
  const shows: Show[] = [];
  let hasCompleteShowProjection = new Set(showIds).size === showIds.length;
  for (const showId of showIds) {
    let show: Show | undefined;
    try {
      show = showsById.get(decodeV4UuidCatalogId(showId, 'show'));
    } catch {
      hasCompleteShowProjection = false;
      continue;
    }

    if (!show || show.deletedAt != null) {
      hasCompleteShowProjection = false;
      continue;
    }
    shows.push(show);
  }

  if (kind === 'artist_venue') {
    const artistVenue = artistVenues.find((venue) => venue.id === rootId);
    const hasCompleteProjection = hasCompleteShowProjection && artistVenue !== undefined;
    return {
      kind,
      artistVenue,
      normalizedVenue: artistVenue?.venue,
      shows,
      hasAppliedData: hasCompleteProjection,
    };
  }

  if (kind === 'imported_venue') {
    let importedVenueUuid: string | undefined;
    try {
      importedVenueUuid = decodeV4UuidCatalogId(rootId, 'imported_venue');
    } catch {
      // An incomplete cached projection must not hide a failed repair.
    }
    const importedVenue = importedVenues.find(
      (venue) => venue.uuid === importedVenueUuid && venue.deletedAt == null
    );
    const hasCompleteProjection =
      hasCompleteShowProjection && importedVenueUuid === venueId && importedVenue !== undefined;
    return {
      kind,
      importedVenue,
      shows,
      hasAppliedData: hasCompleteProjection,
    };
  }

  const normalizedVenue = normalizedVenues.find((venue) => venue.id === rootId);
  const hasCompleteProjection = hasCompleteShowProjection && normalizedVenue !== undefined;
  return {
    kind,
    normalizedVenue,
    shows,
    hasAppliedData: hasCompleteProjection,
  };
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
      return applyV4ArtistVenue(this.realm, this.artistUuid!, resource);
    }

    if (
      this.kind === 'imported_venue' &&
      'upstream_identifier' in resource &&
      resource.id === encodeV4UuidCatalogId(this.venueId, 'imported_venue')
    ) {
      return applyV4ImportedVenue(this.realm, this.artistUuid!, resource);
    }

    if (this.kind === 'venue' && 'global_show_count' in resource) {
      return applyV4Venue(this.realm, resource);
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
  const artistVenues = useQuery(
    ArtistVenue,
    (query) => (artistUuid ? query.filtered('artistUuid == $0', artistUuid) : query),
    [artistUuid]
  );
  const importedVenues = useQuery(
    Venue,
    (query) => (artistUuid ? query.filtered('artistUuid == $0', artistUuid) : query),
    [artistUuid]
  );
  const normalizedVenues = useQuery(NormalizedVenue);
  const shows = useQuery(
    Show,
    (query) => (artistUuid ? query.filtered('artistUuid == $0', artistUuid) : query),
    [artistUuid]
  );
  const behavior = useMemo(
    () => new VenueShowsNetworkBackedBehavior(realm, kind, artistUuid, venueId),
    [artistUuid, kind, realm, venueId]
  );
  const results = useNetworkBackedBehavior(behavior);
  const data = projectVenueDetail(
    kind,
    venueId,
    results.data,
    [...artistVenues],
    [...importedVenues],
    [...normalizedVenues],
    [...shows]
  );

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
