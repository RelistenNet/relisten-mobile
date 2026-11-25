import type {
  ArtistResource,
  ImportedVenueResource,
  PopularityResource,
  ShowSummaryResource,
  SongResource,
  SourceReviewResource,
  SourceSummaryResource,
  TrackResource,
  VenueResource,
} from '@/relisten/api/catalog/resources';
import type { SearchCatalogRow, SearchPerformanceRow } from './search_types';

const date = '2000-06-14T00:00:00Z';
const timestamps = { created_at: date, updated_at: date };

// Sequential UUIDs make the show, source and track route targets easy to distinguish.
export const artist: ArtistResource = {
  id: 'artist_00000000008008000000000001',
  name: 'Phish',
  slug: 'phish',
  sort_name: null,
  musicbrainz_id: null,
  featured: 0,
  show_count: 1,
  source_count: 1,
  features: '0',
  popularity: null,
  upstream_sources: [],
  ...timestamps,
};

export const importedVenue: ImportedVenueResource = {
  id: 'imported_venue_00000000008008000000000005',
  artist_id: artist.id,
  name: 'Drum Logos',
  location: 'Fukuoka, Japan',
  show_count: 1,
  latitude: null,
  longitude: null,
  upstream_identifier: null,
  slug: null,
  past_names: null,
  ...timestamps,
};

export const venue: VenueResource = {
  id: 'venue_bvhfka1g',
  name: 'Drum Logos',
  city: 'Fukuoka',
  region: null,
  country: 'Japan',
  kind: 'room',
  parent_id: null,
  global_show_count: 1,
  latitude: null,
  longitude: null,
  coordinate_precision: null,
  names: [],
};

export const show: ShowSummaryResource = {
  id: 'show_00000000008008000000000002',
  artist_id: artist.id,
  year_id: null,
  tour_id: null,
  date,
  display_date: '2000-06-14',
  avg_rating: 8.254,
  avg_duration: null,
  most_recent_source_updated_at: date,
  has_soundboard_source: true,
  has_streamable_flac_source: true,
  source_count: 1,
  popularity: null,
  imported_venue: importedVenue,
  artist_venue: null,
  year: null,
  tour: null,
  era: null,
  ...timestamps,
};

export const source: SourceSummaryResource = {
  id: 'source_00000000008008000000000003',
  artist_id: artist.id,
  show_id: show.id,
  display_date: show.display_date,
  is_soundboard: true,
  is_remaster: false,
  has_jamcharts: false,
  avg_rating: 8,
  num_reviews: 1,
  num_ratings: null,
  avg_rating_weighted: 0,
  duration: 100,
  upstream_identifier: 'ph2000-06-14',
  description: null,
  taper_notes: null,
  source: null,
  taper: null,
  transferrer: null,
  lineage: null,
  flac_type: 'Flac16Bit',
  review_count: 1,
  imported_venue: importedVenue,
  ...timestamps,
};

export const track: TrackResource = {
  id: 'track_00000000008008000000000004',
  artist_id: artist.id,
  show_id: show.id,
  source_id: source.id,
  source_set_id: 'source_set_00000000008008000000000006',
  track_position: 10,
  duration: 88,
  title: 'Twist -> Jam',
  slug: 'twist-jam',
  playable: true,
  mp3_url: 'https://example.com/twist.mp3',
  mp3_md5: null,
  flac_url: null,
  flac_md5: null,
  normalization: { state: 'unavailable', reason: 'not_interpreted', parts: [] },
  ...timestamps,
};

export const song: SongResource = {
  id: 'song_hf5bcx7b',
  artist_id: artist.id,
  name: 'Twist',
  kind: 'song',
};

export const showRow = { kind: 'show', key: `show:${show.id}`, show, artist } as const;
export const songRow = { kind: 'song', key: `song:${song.id}`, song, artist } as const;
export const recordingRow = {
  kind: 'recording',
  key: `recording:${source.id}`,
  source,
  show,
  artist,
} as const;

const review: SourceReviewResource = {
  id: 'source_review_00000000008008000000000007',
  source_id: source.id,
  rating: null,
  title: null,
  review: 'Listened for the Twist jam.',
  author: null,
  ...timestamps,
};
export const reviewRow = {
  ...recordingRow,
  kind: 'review',
  key: `review:${review.id}`,
  review,
} as const;
export const performanceRow: SearchPerformanceRow = {
  kind: 'performance',
  key: `performance:${show.id}:${song.id}`,
  artist,
  show,
  performance: { show_id: show.id, song_id: song.id, song: song.name },
  preview_track: track,
};
export const sequenceRow: Extract<SearchCatalogRow, { kind: 'sequence' }> = {
  kind: 'sequence',
  key: `sequence:${show.id}:${song.id},song_aaaaaaaa`,
  artist,
  show,
  passage: {
    source_id: source.id,
    tracks: [track],
    parts: [
      { song, track_id: track.id, ordinal: 0 },
      { song: { ...song, id: 'song_aaaaaaaa', name: 'Jam' }, track_id: track.id, ordinal: 1 },
    ],
  },
};

export function yearlyPlays(plays: number): PopularityResource {
  const empty = { plays: 0, hours: 0, hot_score: 0 };
  return {
    momentum_score: 0,
    trend_ratio: 0,
    windows: { '48h': empty, '7d': empty, '30d': empty, '1y': { plays, hours: 0, hot_score: 0 } },
  };
}
