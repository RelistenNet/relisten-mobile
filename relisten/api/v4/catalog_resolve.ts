import type { V4SongDetailResource, V4VenueResource } from './wire_types';

export type V4ResolvedFavoriteKind = 'song' | 'venue';

export interface V4CatalogReferenceRequest {
  kind: V4ResolvedFavoriteKind;
  scheme: 'v4';
  id: string;
  artist_id?: string;
}

export interface V4CatalogReferenceResolution {
  kind: V4ResolvedFavoriteKind;
  scheme: 'v4';
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
    venues: V4VenueResource[];
    songs: V4SongDetailResource[];
  };
}
