import type { FavoriteTargetKind } from '@/relisten/realm/models/library/favorite_catalog_type';
import type {
  ArtistResource,
  ArtistVenueResource,
  ImportedSongResource,
  ImportedVenueResource,
  ShowSummaryResource,
  SongDetailResource,
  SourceResource,
  SourceSetResource,
  TourResource,
  TrackResource,
  VenueResource,
  YearResource,
} from './resources';

export type ResolvedFavoriteKind = FavoriteTargetKind;

export interface CatalogReferenceRequest {
  kind: ResolvedFavoriteKind;
  scheme: 'v4' | 'legacy_integer';
  id: string;
  artist_id?: string;
}

export interface CatalogReferenceResolution {
  kind: ResolvedFavoriteKind;
  scheme: 'v4' | 'legacy_integer';
  id: string;
  artist_id: string | null;
  availability: 'available' | 'redirected' | 'unavailable' | 'retired';
  target: {
    kind: ResolvedFavoriteKind;
    id: string;
  } | null;
  reason: string | null;
}

/** Resolver entity arrays are additive patches, not catalog memberships. */
export interface CatalogResolveResponse {
  references: CatalogReferenceResolution[];
  entities: {
    artists: ArtistResource[];
    years: YearResource[];
    tours: TourResource[];
    imported_venues: ImportedVenueResource[];
    imported_songs: ImportedSongResource[];
    artist_venues: ArtistVenueResource[];
    shows: ShowSummaryResource[];
    sources: Omit<SourceResource, 'sets' | 'links'>[];
    source_sets: Omit<SourceSetResource, 'tracks'>[];
    tracks: TrackResource[];
    venues: VenueResource[];
    songs: SongDetailResource[];
  };
}
