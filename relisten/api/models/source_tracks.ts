export interface SourceTrack {
  created_at: string;
  updated_at: string;
  source_uuid: string;
  source_set_uuid: string;
  artist_uuid: string;
  show_uuid: string;
  track_position: number;
  duration?: number;
  title: string;
  slug: string;
  mp3_url?: string;
  mp3_md5?: string;
  flac_url?: string;
  flac_md5?: string;
  uuid: string;

  __injected_show_uuid: string;
}
