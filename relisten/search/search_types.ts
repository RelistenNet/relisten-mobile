/**
 * The fields of a `GET /v1/search` response that the app reads. The merged
 * response comes from `RelistenUserService/Search/MergedSearch.cs`; its
 * `catalog` body is the catalog index's own response, passed through. Fields
 * the app doesn't read are left out, so an added server field never breaks it.
 */

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

export interface SearchInterpretation {
  terms: string;
  chips: SearchInterpretationChip[];
}

/** Fields every catalog row carries. Empty strings and zeros mean "not set". */
interface SearchRowBase {
  id: string;
  label: string;
  artist_label: string;
  /** The artist's lowercase search name. */
  artist?: string;
  artist_slug: string;
  /** Missing on recording, review and passage rows; load the artist by slug instead. */
  artist_id?: string;
  /** A shared venue's artists. Imported venue rows leave it empty and set `artist_id`. */
  artist_slugs?: string[];
  /** `yyyymmdd`, or 0. */
  date: number;
  venue_label: string;
  city_label: string;
  /** Venue location as the app's venue rows print it. Missing from older indexes. */
  location_label?: string;
  venue_id: string;
  show_id: string;
  tour_label: string;
  song_id: string;
  source_id: string;
  source_upstream: string;
  /** A show's or recording's total plays; 0 on other rows. */
  track_plays?: number;
  /** A show's or recording's 0–10 rating, or 0 when unrated. Missing from older indexes. */
  avg_rating?: number;
  /** A recording's review count. */
  num_reviews?: number;
  soundboard: boolean;
  soundcheck: boolean;
  /**
   * Matching text, with `<mark>` around the match. Review rows have no label,
   * only this; a recording's matches its notes or its credits.
   */
  highlights?: { review_text?: string; notes?: string; credits?: string };
  /** A recording's taper and transferrer. Missing from older indexes. */
  taper_label?: string;
  transferrer_label?: string;
}

export interface SearchArtistRow extends SearchRowBase {
  kind: 'artist';
}

/** `id` is a `song_` short ID or an `imported_song_` UUID ID. */
export interface SearchSongRow extends SearchRowBase {
  kind: 'song';
}

/** `venue_id` is a `venue_` short ID or an `imported_venue_` UUID ID. */
export interface SearchVenueRow extends SearchRowBase {
  kind: 'venue';
}

export interface SearchShowRow extends SearchRowBase {
  kind: 'show';
}

/** The file a performance row labels: the exact track its **+** adds. */
export interface SearchPerformancePreview {
  track_id: string;
  source_id: string;
  set: string;
  set_index: number;
  position: number;
  /** Seconds. */
  duration: number;
  /** How often this file was played. */
  plays?: number;
  soundboard: boolean;
  soundcheck: boolean;
  label: string;
}

/** One song played at one show. Two rows from one show stay separate. */
export interface SearchPerformanceRow extends SearchRowBase {
  kind: 'performance';
  preview: SearchPerformancePreview;
}

/** A recording. Its `id` is the `source_` ID; `source_id` is empty. */
export interface SearchRecordingRow extends SearchRowBase {
  kind: 'recording';
}

export interface SearchReviewRow extends SearchRowBase {
  kind: 'review';
}

export interface SearchTourRow extends SearchRowBase {
  kind: 'tour';
}

/** A passage: songs played back to back in one source, in order. */
export interface SearchSequenceRow {
  kind: 'sequence';
  artist_slug: string;
  show_id: string;
  source_id: string;
  set: string;
  date: number;
  venue: string;
  song_ids: string[];
  track_ids: string[];
}

export type SearchCatalogRow =
  | SearchArtistRow
  | SearchSongRow
  | SearchVenueRow
  | SearchShowRow
  | SearchPerformanceRow
  | SearchRecordingRow
  | SearchReviewRow
  | SearchTourRow
  | SearchSequenceRow;

export interface SearchCatalogCounts {
  artists: number;
  songs: number;
  venues: number;
  shows: number;
  sources: number;
  /** Present only when the query can match reviews; the Reviews chip shows only then. */
  reviews?: number;
}

/**
 * The catalog half. The All scope returns `top` and `sections`; a single
 * scope returns `results` instead.
 */
export interface SearchCatalogBody {
  availability: SearchAvailability;
  interpretation: SearchInterpretation;
  counts: SearchCatalogCounts;
  top?: SearchCatalogRow[];
  sections?: {
    sources?: SearchCatalogRow[];
    reviews?: SearchCatalogRow[];
    passages?: SearchCatalogRow[];
  };
  results?: SearchCatalogRow[];
}

/** A playlist card. `public_code` is set only while the playlist is public. */
export interface SearchPlaylistCard {
  kind: 'playlist';
  id: string;
  label: string;
  description: string | null;
  track_count: number;
  owned: boolean;
  public_code: string | null;
  curator: string | null;
}

export interface SearchResponse {
  q: string;
  request_id: string | null;
  catalog_availability: SearchAvailability;
  playlist_availability: SearchAvailability;
  catalog: SearchCatalogBody | null;
  playlists: SearchPlaylistCard[];
  page: number;
  playlist_next_page: number | null;
}

/** What the app asks for. `ignore` and `boostArtistIds` are sent comma-separated. */
export interface SearchRequest {
  q: string;
  scope: SearchScope;
  mode: SearchMode;
  typing: boolean;
  requestId: string;
  artistId?: string;
  boostArtistIds?: readonly string[];
  ignore?: readonly string[];
  page?: number;
}
