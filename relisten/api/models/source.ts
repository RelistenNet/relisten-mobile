import { SourceSet } from './source_set';
import { VenueWithShowCounts } from './venue';
import { Show } from './show';
import { SlimArtistWithFeatures } from './artist';
import { components } from '@/relisten/api/schema';

export type SourceReview = components['schemas']['SourceReview'];

export interface Link {
  created_at: string;
  updated_at: string;
  source_id: number;
  upstream_source_id: number;
  for_reviews: boolean;
  for_ratings: boolean;
  for_source: boolean;
  url: string;
  label: string;
}

export enum FlacType {
  NoFlac = 'NoFlac',
  Flac16Bit = 'Flac16Bit',
  Flac24Bit = 'Flac24Bit',
  NoPlayableFlac = 'NoPlayableFlac',
}

export interface SlimSource {
  created_at: string;
  updated_at: string;
  artist_uuid: string;
  venue_uuid: string;
  venue?: VenueWithShowCounts;
  display_date: string;
  is_soundboard: boolean;
  is_remaster: boolean;
  has_jamcharts: boolean;
  avg_rating: number;
  num_reviews: number;
  num_ratings?: number;
  avg_rating_weighted: number;
  duration?: number;
  upstream_identifier: string;
  uuid: string;

  // only used for deep-linking
  id: string;
}

export interface Source extends SlimSource {
  show_uuid: string;
  show?: Show;
  description: string;
  taper_notes: string;
  source: string;
  taper: string;
  transferrer: string;
  lineage: string;
  flac_type: FlacType;
}

export interface SourceFull extends Source {
  review_count: number;
  sets: SourceSet[];
  links: Link[];
}

export interface ShowWithSources extends Show {
  sources: SourceFull[];
}

export interface SlimSourceWithShowVenueAndArtist extends SlimSource {
  show_uuid: string;
  show: Show;
  artist: SlimArtistWithFeatures;
}
