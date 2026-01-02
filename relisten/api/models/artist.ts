import { VenueWithShowCounts } from './venue';
import { SetlistSongWithPlayCount } from './setlist_song';
import { TourWithShowCount } from './tour';
import { Show } from './show';
import { Year } from './year';

export interface SlimArtist {
  created_at: string;
  /** Format: date-time */
  updated_at: string;
  musicbrainz_id: string;
  name: string;
  popularity?: Popularity;
  /** Format: int32 */
  featured: number;
  slug: string;
  sort_name: string;
  /** Format: uuid */
  uuid: string;
}

export interface SlimArtistWithFeatures extends SlimArtist {
  features: Features;
}

export interface Artist extends SlimArtistWithFeatures {
  /** Format: date-time */
  upstream_sources: ArtistUpstreamSource[];
}

export interface ArtistWithCounts extends Artist {
  /** Format: int32 */
  show_count: number;
  /** Format: int32 */
  source_count: number;
}

export interface FullArtist {
  artist: ArtistWithCounts;
  venues: VenueWithShowCounts[];
  songs: SetlistSongWithPlayCount[];
  tours: TourWithShowCount[];
  years: Year[];
  shows: Show[];
}

export interface ArtistUpstreamSource {
  /** Format: int32 */
  upstream_source_id: number;
  upstream_identifier: string | null;
  /** Format: uuid */
  artist_uuid: string;
  upstream_source: UpstreamSource;
}

export interface UpstreamSource {
  name: string;
  url: string;
  description: string;
  credit_line: string;
}

export interface Features {
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
}

export interface Popularity {
  momentum_score: number;
  trend_ratio: number;
  windows: PopularityWindows;
}

export interface PopularityWindows {
  '48h': PopularityWindow;
  '7d': PopularityWindow;
  '30d': PopularityWindow;
}

export interface PopularityWindow {
  plays: number;
  hours: number;
  hot_score: number;
}
