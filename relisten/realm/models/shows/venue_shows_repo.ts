import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import { useRelistenApi } from '@/relisten/api/context';
import { VenueWithShows } from '@/relisten/api/models/venue';
import { decodeV4UuidCatalogId, encodeV4UuidCatalogId } from '@/relisten/api/v4/catalog_identity';
import { NetworkBackedBehaviorOptions } from '@/relisten/realm/network_backed_behavior';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import {
  mergeNetworkBackedResults,
  NetworkBackedResults,
} from '@/relisten/realm/network_backed_results';
import { useQuery, useRealm } from '@/relisten/realm/schema';
import { ThrottledNetworkBackedBehavior } from '@/relisten/realm/throttled_network_backed_behavior';
import {
  CombinedValueStream,
  MappedValueStream,
  RealmObjectValueStream,
  RealmQueryValueStream,
  ValueStream,
} from '@/relisten/realm/value_streams';
import { useMemo } from 'react';
import Realm from 'realm';

import { upsertShowList } from '../repo_utils';
import { useArtist } from '../artist_repo';
import { Show } from '../show';
import { Venue } from '../venue';
import { venueRepo } from '../venue_repo';
import { ArtistVenue, CatalogQueryState, NormalizedVenue } from '../v4_catalog';

export type VenueDetailKind = 'artist_venue' | 'imported_venue' | 'venue';

export interface VenueShows {
  kind: VenueDetailKind;
  artistVenue?: ArtistVenue;
  importedVenue?: Venue;
  normalizedVenue?: NormalizedVenue;
  shows: Show[];
  hasAppliedData: boolean;
}

interface LegacyVenueShows {
  venue: Venue | null;
  shows: Realm.Results<Show>;
}

interface VenueDetailLocalData {
  queryState: CatalogQueryState | null;
  legacy: LegacyVenueShows | null;
}

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
  useV4: boolean,
  kind: VenueDetailKind,
  venueId: string,
  state: CatalogQueryState | null,
  artistVenues: ReadonlyArray<ArtistVenue>,
  importedVenues: ReadonlyArray<Venue>,
  normalizedVenues: ReadonlyArray<NormalizedVenue>,
  allShows: ReadonlyArray<Show>
): VenueShows {
  if (!useV4) {
    const importedVenue = importedVenues.find(
      (venue) => venue.uuid === venueId && venue.deletedAt == null
    );
    return {
      kind: 'imported_venue',
      importedVenue,
      shows: allShows.filter((show) => show.deletedAt == null && show.venueUuid === venueId),
      hasAppliedData: false,
    };
  }

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
    const hasCompleteProjection =
      hasCompleteShowProjection &&
      artistVenue !== undefined &&
      artistVenue.venueId === artistVenue.venue.id &&
      shows.every((show) => show.artistVenue?.id === artistVenue.id);
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
      hasCompleteShowProjection &&
      importedVenueUuid === venueId &&
      importedVenue !== undefined &&
      shows.every((show) => show.venueUuid === importedVenue.uuid);
    return {
      kind,
      importedVenue,
      shows,
      hasAppliedData: hasCompleteProjection,
    };
  }

  const normalizedVenue = normalizedVenues.find((venue) => venue.id === rootId);
  const hasCompleteProjection =
    hasCompleteShowProjection &&
    normalizedVenue !== undefined &&
    shows.every((show) => show.artistVenue?.venueId === normalizedVenue.id);
  return {
    kind,
    normalizedVenue,
    shows,
    hasAppliedData: hasCompleteProjection,
  };
}

class VenueShowsNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  VenueDetailLocalData,
  VenueWithShows
> {
  constructor(
    realm: Realm,
    private readonly useV4: boolean,
    private readonly kind: VenueDetailKind,
    private readonly artistUuid: string | undefined,
    private readonly venueId: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  override createLocalUpdatingResults(): ValueStream<VenueDetailLocalData> {
    if (this.useV4) {
      return new MappedValueStream<CatalogQueryState | null, VenueDetailLocalData>(
        new RealmObjectValueStream(
          this.realm,
          CatalogQueryState,
          venueDetailQueryKey(this.kind, this.artistUuid, this.venueId)
        ),
        (queryState) => ({ queryState, legacy: null })
      );
    }

    return new MappedValueStream<LegacyVenueShows, VenueDetailLocalData>(
      new CombinedValueStream(
        new RealmObjectValueStream(this.realm, Venue, this.venueId),
        new RealmQueryValueStream(
          this.realm,
          this.realm.objects(Show).filtered('venueUuid == $0 && deletedAt == nil', this.venueId)
        ),
        (venue, shows) => ({ venue: venue?.deletedAt == null ? venue : null, shows })
      ),
      (legacy) => ({ queryState: null, legacy })
    );
  }

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<VenueWithShows>> {
    if (!this.useV4) {
      return api.venue(this.artistUuid!, this.venueId, api.refreshOptions(forcedRefresh));
    }

    switch (this.kind) {
      case 'artist_venue':
        return api.refreshV4ArtistVenue(this.artistUuid!, this.venueId, forcedRefresh);
      case 'imported_venue':
        return api.refreshV4ImportedVenue(this.artistUuid!, this.venueId, forcedRefresh);
      case 'venue':
        return api.refreshV4Venue(this.venueId, forcedRefresh);
    }
  }

  isLocalDataShowable(localData: VenueDetailLocalData): boolean {
    if (this.useV4) return localData.queryState?.hasAppliedData === true;

    return localData.legacy?.venue !== null && (localData.legacy?.shows.length ?? 0) > 0;
  }

  override upsert(localData: VenueDetailLocalData, apiData: VenueWithShows): void {
    if (this.useV4) return;

    const legacy = localData.legacy;
    if (!legacy?.shows.isValid()) return;

    this.realm.write(() => {
      upsertShowList(this.realm, apiData.shows, legacy.shows, {
        performDeletes: false,
        queryForModel: true,
        upsertModels: { venues: true },
      });
      venueRepo.upsert(this.realm, apiData, legacy.venue ?? undefined, true);
    });
  }
}

function useVenueDetail(
  artistUuid: string | undefined,
  venueId: string,
  kind: VenueDetailKind
): NetworkBackedResults<VenueShows> {
  const realm = useRealm();
  const { apiClient } = useRelistenApi();
  const useV4 = apiClient.usesV4Catalog();
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
    () => new VenueShowsNetworkBackedBehavior(realm, useV4, kind, artistUuid, venueId),
    [artistUuid, kind, realm, useV4, venueId]
  );
  const results = useNetworkBackedBehavior(behavior);
  const data = projectVenueDetail(
    useV4,
    kind,
    venueId,
    results.data.queryState,
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
