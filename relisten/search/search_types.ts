import type {
  ArtistResource,
  CatalogPerformanceSummary,
  ImportedSongResource,
  ImportedVenueResource,
  PopularityResource,
  ShowSummaryResource,
  SongResource,
  SourceId,
  SourceReviewResource,
  SourceSummaryResource,
  TourResource,
  TrackId,
  TrackResource,
  VenueResource,
} from '@/relisten/api/catalog/resources';

export type SearchScope =
  | 'all'
  | 'artists'
  | 'songs'
  | 'venues'
  | 'shows'
  | 'sources'
  | 'reviews'
  | 'playlists';

/** `add_tracks` ranks exact files for the Add Tracks sheet; `explore` is the Search tab. */
export type SearchMode = 'explore' | 'add_tracks';

/**
 * Whether one half of the response could be searched. `not_requested` means
 * the scope or `ignore` left it out. Anything other than `unavailable` with no
 * body is a real answer, even when it has no rows.
 */
export type SearchAvailability = 'full' | 'partial' | 'unavailable' | 'not_requested';

/** A clue the server read from the query, such as an artist or a year. */
export interface SearchInterpretationChip {
  /** What removing the chip sends in `ignore`: `artist`, `year`, `run`, ... */
  key: string;
  label: string;
  value: string;
}

export interface SearchReading {
  id: string;
  chips: SearchInterpretationChip[];
}

export interface SearchReadings {
  applied: SearchReading | null;
  alternatives: SearchReading[];
}

interface SearchRowBase {
  key: string;
  popularity?: PopularityResource;
  match?: {
    reading?: string;
    highlights?: Record<string, string>;
  };
}

interface ArtistRow extends SearchRowBase {
  artist: ArtistResource;
}

interface ShowRow extends ArtistRow {
  show: ShowSummaryResource;
}

export interface SearchPerformanceRow extends ShowRow {
  kind: 'performance';
  performance?: CatalogPerformanceSummary;
  preview_track: TrackResource;
}

interface PassageResource {
  source_id: SourceId;
  tracks: TrackResource[];
  parts: { song: SongResource; track_id: TrackId; ordinal: number }[];
}

export type SearchCatalogRow =
  | (ArtistRow & { kind: 'artist' })
  | (ArtistRow & { kind: 'song'; song: SongResource | ImportedSongResource })
  | (SearchRowBase & {
      kind: 'venue';
    } & (
        | { venue: VenueResource; artist?: ArtistResource }
        | { venue: ImportedVenueResource; artist: ArtistResource }
      ))
  | (ShowRow & { kind: 'show'; source?: SourceSummaryResource })
  | SearchPerformanceRow
  | (ShowRow & { kind: 'recording'; source: SourceSummaryResource })
  | (ShowRow & { kind: 'review'; source: SourceSummaryResource; review: SourceReviewResource })
  | (ArtistRow & { kind: 'tour'; tour: TourResource })
  | (ShowRow & { kind: 'sequence'; passage: PassageResource });

export type SearchCatalogCounts = Partial<Record<SearchScope, number>>;

/** Metadata for a playlist the caller can currently view. */
export interface SearchPlaylistCard {
  id: string;
  name: string;
  track_count: number;
  owned: boolean;
  description?: string;
  public_code?: string;
  curator?: string;
}

export type SearchResult =
  | SearchCatalogRow
  | (SearchRowBase & { kind: 'playlist'; playlist: SearchPlaylistCard });

export interface SearchResponse {
  q: string;
  request_id: string | null;
  scope: SearchScope;
  availability: { catalog: SearchAvailability; playlists: SearchAvailability };
  counts: SearchCatalogCounts;
  readings: SearchReadings;
  results: SearchResult[];
  next_page: number | null;
  more_scopes: ('shows' | 'sources')[];
}

/** What the app asks for. `ignore` and `boostArtistIds` are sent comma-separated. */
export interface SearchRequest {
  q: string;
  scope: SearchScope;
  mode: SearchMode;
  typing: boolean;
  requestId: string;
  artistId?: string;
  readingId?: string;
  boostArtistIds?: readonly string[];
  ignore?: readonly string[];
  page?: number;
}
