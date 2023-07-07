import { SourceTrack } from './source_tracks';
import { SlimSourceWithShowVenueAndArtist } from './source';

export interface PlayedSourceTrack {
  source: SlimSourceWithShowVenueAndArtist;
  track: SourceTrack;
}

export enum SourceTrackPlayAppType {
  Unknown = 0,
  iOS,
  Web,
  Sonos,
}

export enum SourceTrackPlayAppTypeDescription {
  Unknown = 'Unknown',
  iOS = 'iOS',
  Web = 'Web',
  Sonos = 'Sonos',
}

export interface SourceTrackPlay {
  id: number;
  created_at: string;
  source_track_uuid: string;
  user_uuid: string;
  app_type: SourceTrackPlayAppType;
  app_type_description: SourceTrackPlayAppTypeDescription;
  track?: PlayedSourceTrack;
}
