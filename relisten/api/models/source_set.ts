import { SourceTrack } from './source_tracks';

export interface SourceSet {
  created_at: string;
  updated_at: string;
  source_uuid: string;
  artist_uuid: string;
  uuid: string;
  index: number;
  is_encore: boolean;
  name: string;
  tracks: SourceTrack[];

  __injected_show_uuid: string;
}
