import type { ArtistWithCounts } from '@/relisten/api/models/artist';
import type { Show } from '@/relisten/api/models/show';
import type { SongWithPlayCount } from '@/relisten/api/models/song';
import type { SourceFull } from '@/relisten/api/models/source';
import type { SourceSet } from '@/relisten/api/models/source_set';
import type { SourceTrack } from '@/relisten/api/models/source_tracks';
import type { TourWithShowCount } from '@/relisten/api/models/tour';
import type { VenueWithShowCounts } from '@/relisten/api/models/venue';
import type { Year } from '@/relisten/api/models/year';
import type { FavoriteCatalogType } from '@/relisten/realm/models/library';

export interface CatalogReferenceRequest {
  catalog_type: FavoriteCatalogType;
  catalog_uuid: string;
}

export interface CatalogResolveRequest {
  contract_version: 1;
  references: CatalogReferenceRequest[];
}

export interface ResolvedCatalogReference extends CatalogReferenceRequest {
  availability: 'available' | 'unavailable';
}

/**
 * The resolver returns ordinary catalog DTOs so mobile can reuse its proven
 * API-to-Realm mapping. Arrays also contain the shallow parent rows needed to
 * render a requested child without follow-up reads.
 */
export interface CatalogResolveResponse {
  contract_version: 1;
  checked_at: string;
  references: ResolvedCatalogReference[];
  entities: {
    artists: ArtistWithCounts[];
    years: Year[];
    shows: Show[];
    sources: SourceFull[];
    source_sets: SourceSet[];
    source_tracks: SourceTrack[];
    songs: SongWithPlayCount[];
    tours: TourWithShowCount[];
    venues: VenueWithShowCounts[];
  };
}
