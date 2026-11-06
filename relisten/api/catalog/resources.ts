export type UuidCatalogPrefix =
  | 'artist'
  | 'year'
  | 'show'
  | 'tour'
  | 'imported_venue'
  | 'imported_song'
  | 'source'
  | 'source_set'
  | 'track';

export type ShortCatalogPrefix = 'venue' | 'song' | 'artist_venue';

export type UuidCatalogId<TPrefix extends UuidCatalogPrefix> = `${TPrefix}_${string}`;
export type ShortCatalogId<TPrefix extends ShortCatalogPrefix> = `${TPrefix}_${string}`;

export type ArtistId = UuidCatalogId<'artist'>;
export type YearId = UuidCatalogId<'year'>;
export type ShowId = UuidCatalogId<'show'>;
export type TourId = UuidCatalogId<'tour'>;
export type ImportedVenueId = UuidCatalogId<'imported_venue'>;
export type ImportedSongId = UuidCatalogId<'imported_song'>;
export type SourceId = UuidCatalogId<'source'>;
export type SourceSetId = UuidCatalogId<'source_set'>;
export type TrackId = UuidCatalogId<'track'>;
export type VenueId = ShortCatalogId<'venue'>;
export type SongId = ShortCatalogId<'song'>;
export type ArtistVenueId = ShortCatalogId<'artist_venue'>;

/** Public activity is an online feed; sequence resumes polling without persisting catalog membership. */
export interface LiveHistoryResource {
  sequence: number;
  played_at: string;
  app_type: 'ios' | 'web' | 'sonos' | 'android';
  track: TrackResource;
  show: ShowSummaryResource;
}

export interface PopularityWindowResource {
  plays: number;
  hours: number;
  hot_score: number;
}

export interface PopularityResource {
  momentum_score: number;
  trend_ratio: number;
  windows: {
    '48h': PopularityWindowResource;
    '7d': PopularityWindowResource;
    '30d': PopularityWindowResource;
  };
}

export interface ArtistFeaturesResource {
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

export interface ArtistProviderResource {
  provider: string;
  upstream_identifier: string | null;
  url: string | null;
  description: string | null;
  credit_line: string | null;
}

export interface ArtistResource {
  popularity: PopularityResource | null;
  id: ArtistId;
  name: string;
  slug: string;
  sort_name: string | null;
  musicbrainz_id: string | null;
  featured: number;
  show_count: number;
  source_count: number;
  created_at: string;
  updated_at: string;
  features: ArtistFeaturesResource;
  upstream_sources: ArtistProviderResource[];
}

export interface YearResource {
  popularity: PopularityResource | null;
  id: YearId;
  artist_id: ArtistId;
  show_count: number;
  source_count: number;
  duration: number | null;
  avg_duration: number | null;
  avg_rating: number;
  year: string;
  created_at: string;
  updated_at: string;
}

export interface TourResource {
  id: TourId;
  artist_id: ArtistId;
  show_count: number;
  start_date: string | null;
  end_date: string | null;
  name: string;
  slug: string;
  upstream_identifier: string;
  created_at: string;
  updated_at: string;
}

export interface EraResource {
  order: number;
  name: string;
}

export interface ImportedVenueResource {
  show_count: number;
  id: ImportedVenueId;
  artist_id: ArtistId;
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

export type VenueKind = 'site' | 'room';
export type VenueCoordinatePrecision = 'venue' | 'city';
export type VenueNameKind = 'official' | 'short' | 'spelling';

export interface VenueNameResource {
  name: string;
  kind: VenueNameKind;
}

export interface VenueResource {
  id: VenueId;
  global_show_count: number;
  name: string;
  kind: VenueKind;
  parent_id: VenueId | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinate_precision: VenueCoordinatePrecision | null;
  names: VenueNameResource[];
}

export interface ArtistVenueResource {
  id: ArtistVenueId;
  artist_id: ArtistId;
  artist_show_count: number;
  created_at: string;
  updated_at: string;
  venue: VenueResource;
}

export type ArtistVenueEntryResource =
  | {
      kind: 'artist_venue';
      artist_venue: ArtistVenueResource;
      imported_venue: null;
    }
  | {
      kind: 'imported_venue';
      artist_venue: null;
      imported_venue: ImportedVenueResource;
    };

export interface ArtistVenueWithShowsResource extends ArtistVenueResource {
  shows: ShowSummaryResource[];
}

export interface ImportedVenueWithShowsResource extends ImportedVenueResource {
  shows: ShowSummaryResource[];
}

export interface VenueWithShowsResource extends VenueResource {
  shows: ShowSummaryResource[];
}

export type SongKind = 'song' | 'jam' | 'segment' | 'tuning' | 'banter' | 'other';

export interface SongResource {
  id: SongId;
  artist_id: ArtistId;
  name: string;
  kind: SongKind | null;
}

export interface SongDetailResource extends SongResource {
  slug: string;
  original_artist: string | null;
  aliases: string[];
  matched_track_count: number;
  matched_show_count: number;
}

export interface SongWithShowsResource extends SongDetailResource {
  shows: SongShowResource[];
}

export interface SongShowResource {
  show: ShowSummaryResource;
  timings: {
    single_song: SourceStatisticsResource | null;
    multi_song: SourceStatisticsResource | null;
  };
  tracks?: Pick<TrackResource, 'id' | 'source_id' | 'show_id' | 'title' | 'slug' | 'duration'>[];
}

export interface SourceStatisticsResource {
  source_count: number;
  min: number;
  max: number;
  avg: number;
  median: number;
}

export interface SongWithTracksResource extends SongDetailResource {
  tracks: TrackResource[];
}

export interface ImportedSongResource {
  normalized_song_id: SongId | null;
  id: ImportedSongId;
  artist_id: ArtistId;
  name: string;
  slug: string;
  upstream_identifier: string;
  setlist_show_count: number;
  created_at: string;
  updated_at: string;
}

export interface ImportedSongWithShowsResource extends ImportedSongResource {
  shows: ShowSummaryResource[];
}

export type ArtistSongEntryResource =
  | {
      kind: 'song';
      song: SongDetailResource;
      imported_song: null;
    }
  | {
      kind: 'imported_song';
      song: null;
      imported_song: ImportedSongResource;
    };

export type TrackNormalizationState = 'unavailable' | 'partial' | 'interpreted';
export type TrackNormalizationUnavailableReason = 'disabled' | 'not_interpreted' | 'inconsistent';
export type TrackPartState = 'matched' | 'non_song' | 'unresolved';
export type TrackQualifier =
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

export interface TrackPartResource {
  ordinal: number;
  text: string | null;
  qualifiers: TrackQualifier[];
  notes: string[];
  segue_after: boolean;
  song: SongResource | null;
  state: TrackPartState;
}

export interface TrackNormalizationResource {
  state: TrackNormalizationState;
  reason: TrackNormalizationUnavailableReason | null;
  parts: TrackPartResource[];
}

export interface TrackResource {
  id: TrackId;
  source_id: SourceId;
  source_set_id: SourceSetId;
  show_id: ShowId;
  artist_id: ArtistId;
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
  normalization: TrackNormalizationResource;
}

export interface SourceSetResource {
  id: SourceSetId;
  source_id: SourceId;
  artist_id: ArtistId;
  index: number;
  is_encore: boolean;
  name: string;
  created_at: string;
  updated_at: string;
  tracks: TrackResource[];
}

export type SourceFlacType = 'NoFlac' | 'Flac16Bit' | 'Flac24Bit' | 'NoPlayableFlac' | 'Unknown';

export interface LinkResource {
  source_id: SourceId;
  provider: string;
  for_reviews: boolean;
  for_ratings: boolean;
  for_source: boolean;
  url: string;
  label: string;
  created_at: string;
  updated_at: string;
}

export interface SourceResource {
  id: SourceId;
  artist_id: ArtistId;
  show_id: ShowId;
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
  flac_type: SourceFlacType;
  review_count: number;
  created_at: string;
  updated_at: string;
  imported_venue: ImportedVenueResource | null;
  sets: SourceSetResource[];
  links: LinkResource[];
}

export interface ShowSummaryResource {
  id: ShowId;
  artist_id: ArtistId;
  year_id: YearId | null;
  tour_id: TourId | null;
  date: string;
  display_date: string;
  avg_rating: number;
  avg_duration: number | null;
  most_recent_source_updated_at: string;
  has_soundboard_source: boolean;
  has_streamable_flac_source: boolean;
  source_count: number;
  popularity: PopularityResource | null;
  created_at: string;
  updated_at: string;
  imported_venue: ImportedVenueResource | null;
  artist_venue: ArtistVenueResource | null;
  year: YearResource | null;
  tour: TourResource | null;
  era: EraResource | null;
}

export interface ShowResource extends ShowSummaryResource {
  sources: SourceResource[];
}

export interface YearWithShowsResource extends YearResource {
  shows: ShowSummaryResource[];
}

export interface TourWithShowsResource extends TourResource {
  shows: ShowSummaryResource[];
}
export interface SourceReviewResource {
  id: string;
  source_id: SourceId;
  rating: number | null;
  title: string | null;
  review: string;
  author: string | null;
  created_at: string;
  updated_at: string;
}
