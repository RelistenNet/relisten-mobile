import Artist from '../../db/models/artist';
import { VenueWithShowCounts } from './venue';
import { SetlistSongWithPlayCount } from './setlist_song';
import { TourWithShowCount } from './tour';
import { Show } from './show';
import { Year } from './year';

export interface ArtistWithCounts {
  /** Format: date-time */
  created_at: string;
  /** Format: date-time */
  updated_at: string;
  musicbrainz_id: string;
  name: string;
  /** Format: int32 */
  featured: number;
  slug: string;
  sort_name: string;
  /** Format: uuid */
  uuid: string;
  features: Features;
  upstream_sources: ArtistUpstreamSource[];
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
