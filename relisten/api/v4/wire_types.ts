export type V4UuidCatalogPrefix =
  | 'artist'
  | 'year'
  | 'show'
  | 'tour'
  | 'imported_venue'
  | 'imported_song'
  | 'source'
  | 'source_set'
  | 'track';

export type V4ShortCatalogPrefix = 'venue' | 'song' | 'artist_venue';

export type V4UuidCatalogId<TPrefix extends V4UuidCatalogPrefix> = `${TPrefix}_${string}`;
export type V4ShortCatalogId<TPrefix extends V4ShortCatalogPrefix> = `${TPrefix}_${string}`;

export type V4ArtistId = V4UuidCatalogId<'artist'>;
export type V4YearId = V4UuidCatalogId<'year'>;
export type V4ShowId = V4UuidCatalogId<'show'>;
export type V4TourId = V4UuidCatalogId<'tour'>;
export type V4ImportedVenueId = V4UuidCatalogId<'imported_venue'>;
export type V4ImportedSongId = V4UuidCatalogId<'imported_song'>;
export type V4SourceId = V4UuidCatalogId<'source'>;
export type V4SourceSetId = V4UuidCatalogId<'source_set'>;
export type V4TrackId = V4UuidCatalogId<'track'>;
export type V4VenueId = V4ShortCatalogId<'venue'>;
export type V4SongId = V4ShortCatalogId<'song'>;
export type V4ArtistVenueId = V4ShortCatalogId<'artist_venue'>;

export interface V4PopularityWindowResource {
  plays: number;
  hours: number;
  hot_score: number;
}

export interface V4PopularityResource {
  momentum_score: number;
  trend_ratio: number;
  windows: {
    '48h': V4PopularityWindowResource;
    '7d': V4PopularityWindowResource;
    '30d': V4PopularityWindowResource;
  };
}

export interface V4ArtistFeaturesResource {
  descriptions: boolean;
  eras: boolean;
  multiple_sources: boolean;
  reviews: boolean;
  ratings: boolean;
  tours: boolean;
  taper_notes: boolean;
  source_information: boolean;
  sets: boolean;
  per_show_venues: boolean;
  per_source_venues: boolean;
  venue_coords: boolean;
  songs: boolean;
  years: boolean;
  track_md5s: boolean;
  review_titles: boolean;
  jam_charts: boolean;
  setlist_data_incomplete: boolean;
  track_names: boolean;
  venue_past_names: boolean;
  reviews_have_ratings: boolean;
  track_durations: boolean;
  can_have_flac: boolean;
  normalization: boolean;
}

export interface V4ArtistProviderResource {
  provider: string;
  upstream_identifier: string | null;
  url: string | null;
  description: string | null;
  credit_line: string | null;
}

export interface V4ArtistResource {
  id: V4ArtistId;
  name: string;
  slug: string;
  sort_name: string | null;
  musicbrainz_id: string | null;
  featured: number;
  show_count: number;
  source_count: number;
  created_at: string;
  updated_at: string;
  features: V4ArtistFeaturesResource;
  upstream_sources: V4ArtistProviderResource[];
}

export interface V4YearResource {
  id: V4YearId;
  artist_id: V4ArtistId;
  show_count: number;
  source_count: number;
  duration: number | null;
  avg_duration: number | null;
  avg_rating: number;
  year: string;
  created_at: string;
  updated_at: string;
}

export interface V4TourResource {
  id: V4TourId;
  artist_id: V4ArtistId;
  show_count: number;
  start_date: string | null;
  end_date: string | null;
  name: string;
  slug: string;
  upstream_identifier: string;
  created_at: string;
  updated_at: string;
}

export interface V4EraResource {
  order: number;
  name: string;
}

export interface V4ImportedVenueResource {
  show_count: number;
  id: V4ImportedVenueId;
  artist_id: V4ArtistId;
  latitude: number | null;
  longitude: number | null;
  name: string | null;
  location: string | null;
  upstream_identifier: string | null;
  slug: string | null;
  past_names: string | null;
  created_at: string;
  updated_at: string;
}

export type V4VenueKind = 'site' | 'room';
export type V4VenueCoordinatePrecision = 'venue' | 'city';
export type V4VenueNameKind = 'official' | 'short' | 'spelling';

export interface V4VenueNameResource {
  name: string;
  kind: V4VenueNameKind;
}

export interface V4VenueResource {
  id: V4VenueId;
  global_show_count: number;
  name: string;
  kind: V4VenueKind;
  parent_id: V4VenueId | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinate_precision: V4VenueCoordinatePrecision | null;
  names: V4VenueNameResource[];
}

export interface V4ArtistVenueResource {
  id: V4ArtistVenueId;
  artist_id: V4ArtistId;
  artist_show_count: number;
  created_at: string;
  updated_at: string;
  venue: V4VenueResource;
}

export type V4ArtistVenueEntryResource =
  | {
      kind: 'artist_venue';
      artist_venue: V4ArtistVenueResource;
      imported_venue: null;
    }
  | {
      kind: 'imported_venue';
      artist_venue: null;
      imported_venue: V4ImportedVenueResource;
    };

export interface V4ArtistVenueWithShowsResource extends V4ArtistVenueResource {
  shows: V4ShowSummaryResource[];
}

export interface V4ImportedVenueWithShowsResource extends V4ImportedVenueResource {
  shows: V4ShowSummaryResource[];
}

export interface V4VenueWithShowsResource extends V4VenueResource {
  shows: V4ShowSummaryResource[];
}

export type V4SongKind = 'song' | 'jam' | 'segment' | 'tuning' | 'banter' | 'other';

export interface V4SongResource {
  id: V4SongId;
  artist_id: V4ArtistId;
  name: string;
  kind: V4SongKind | null;
}

export interface V4SongDetailResource extends V4SongResource {
  slug: string;
  original_artist: string | null;
  aliases: string[];
  matched_track_count: number;
  matched_show_count: number;
}

export interface V4SongWithShowsResource extends V4SongDetailResource {
  shows: V4ShowSummaryResource[];
}

export interface V4SongWithTracksResource extends V4SongDetailResource {
  tracks: V4TrackResource[];
}

export interface V4ImportedSongResource {
  id: V4ImportedSongId;
  artist_id: V4ArtistId;
  name: string;
  slug: string;
  upstream_identifier: string;
  setlist_show_count: number;
  created_at: string;
  updated_at: string;
}

export interface V4ImportedSongWithShowsResource extends V4ImportedSongResource {
  shows: V4ShowSummaryResource[];
}

export type V4ArtistSongEntryResource =
  | {
      kind: 'song';
      song: V4SongDetailResource;
      imported_song: null;
    }
  | {
      kind: 'imported_song';
      song: null;
      imported_song: V4ImportedSongResource;
    };

export type V4TrackNormalizationState = 'unavailable' | 'partial' | 'interpreted';
export type V4TrackNormalizationUnavailableReason = 'disabled' | 'not_interpreted' | 'inconsistent';
export type V4TrackPartState = 'matched' | 'non_song' | 'unresolved';
export type V4TrackQualifier =
  | 'reprise'
  | 'partial'
  | 'unfinished'
  | 'instrumental'
  | 'acoustic'
  | 'with_guest'
  | 'continued'
  | 'tape_flip'
  | 'soundcheck'
  | 'tease'
  | 'intro'
  | 'outro'
  | 'jam';

export interface V4TrackPartResource {
  ordinal: number;
  text: string | null;
  qualifiers: V4TrackQualifier[];
  notes: string[];
  segue_after: boolean;
  song: V4SongResource | null;
  state: V4TrackPartState;
}

export interface V4TrackNormalizationResource {
  state: V4TrackNormalizationState;
  reason: V4TrackNormalizationUnavailableReason | null;
  parts: V4TrackPartResource[];
}

export interface V4TrackResource {
  id: V4TrackId;
  source_id: V4SourceId;
  source_set_id: V4SourceSetId;
  show_id: V4ShowId;
  artist_id: V4ArtistId;
  track_position: number;
  duration: number | null;
  title: string;
  slug: string;
  mp3_url: string | null;
  mp3_md5: string | null;
  flac_url: string | null;
  flac_md5: string | null;
  created_at: string;
  updated_at: string;
  normalization: V4TrackNormalizationResource;
}

export interface V4SourceSetResource {
  id: V4SourceSetId;
  source_id: V4SourceId;
  artist_id: V4ArtistId;
  index: number;
  is_encore: boolean;
  name: string;
  created_at: string;
  updated_at: string;
  tracks: V4TrackResource[];
}

export type V4SourceFlacType = 'NoFlac' | 'Flac16Bit' | 'Flac24Bit' | 'NoPlayableFlac' | 'Unknown';

export interface V4LinkResource {
  source_id: V4SourceId;
  provider: string;
  for_reviews: boolean;
  for_ratings: boolean;
  for_source: boolean;
  url: string;
  label: string;
  created_at: string;
  updated_at: string;
}

export interface V4SourceResource {
  id: V4SourceId;
  artist_id: V4ArtistId;
  show_id: V4ShowId;
  display_date: string;
  is_soundboard: boolean;
  is_remaster: boolean;
  has_jamcharts: boolean;
  avg_rating: number;
  num_reviews: number;
  num_ratings: number | null;
  avg_rating_weighted: number;
  duration: number;
  upstream_identifier: string;
  description: string | null;
  taper_notes: string | null;
  source: string | null;
  taper: string | null;
  transferrer: string | null;
  lineage: string | null;
  flac_type: V4SourceFlacType;
  review_count: number;
  created_at: string;
  updated_at: string;
  imported_venue: V4ImportedVenueResource | null;
  sets: V4SourceSetResource[];
  links: V4LinkResource[];
}

export interface V4ShowSummaryResource {
  id: V4ShowId;
  artist_id: V4ArtistId;
  year_id: V4YearId | null;
  tour_id: V4TourId | null;
  date: string;
  display_date: string;
  avg_rating: number;
  avg_duration: number | null;
  most_recent_source_updated_at: string;
  has_soundboard_source: boolean;
  has_streamable_flac_source: boolean;
  source_count: number;
  popularity: V4PopularityResource | null;
  created_at: string;
  updated_at: string;
  imported_venue: V4ImportedVenueResource | null;
  artist_venue: V4ArtistVenueResource | null;
  year: V4YearResource | null;
  tour: V4TourResource | null;
  era: V4EraResource | null;
}

export interface V4ShowResource extends V4ShowSummaryResource {
  sources: V4SourceResource[];
}

export interface V4YearWithShowsResource extends V4YearResource {
  shows: V4ShowSummaryResource[];
}
