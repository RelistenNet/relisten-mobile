import type { FavoriteTargetKind } from '@/relisten/realm/models/library/favorite_catalog_type';
import type {
  V4ArtistResource,
  V4ArtistVenueResource,
  V4ImportedSongResource,
  V4ImportedVenueResource,
  V4ShowSummaryResource,
  V4SongDetailResource,
  V4SourceResource,
  V4SourceSetResource,
  V4TourResource,
  V4TrackResource,
  V4VenueResource,
  V4YearResource,
} from './wire_types';

export type V4ResolvedFavoriteKind = FavoriteTargetKind;

export interface V4CatalogReferenceRequest {
  kind: V4ResolvedFavoriteKind;
  scheme: 'v4' | 'legacy_integer';
  id: string;
  artist_id?: string;
}

export interface V4CatalogReferenceResolution {
  kind: V4ResolvedFavoriteKind;
  scheme: 'v4' | 'legacy_integer';
  id: string;
  artist_id: string | null;
  availability: 'available' | 'redirected' | 'unavailable' | 'retired';
  target: {
    kind: V4ResolvedFavoriteKind;
    id: string;
  } | null;
  reason: string | null;
}

/** Resolver entity arrays are additive patches, not catalog memberships. */
export interface V4CatalogResolveResponse {
  references: V4CatalogReferenceResolution[];
  entities: {
    artists: V4ArtistResource[];
    years: V4YearResource[];
    tours: V4TourResource[];
    imported_venues: V4ImportedVenueResource[];
    imported_songs: V4ImportedSongResource[];
    artist_venues: V4ArtistVenueResource[];
    shows: V4ShowSummaryResource[];
    sources: Omit<V4SourceResource, 'sets' | 'links'>[];
    source_sets: Omit<V4SourceSetResource, 'tracks'>[];
    tracks: V4TrackResource[];
    venues: V4VenueResource[];
    songs: V4SongDetailResource[];
  };
}
