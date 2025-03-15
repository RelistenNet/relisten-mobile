import Realm from 'realm';

import { SourceTrackOfflineInfo } from '@/relisten/realm/models/source_track_offline_info';
import dayjs from 'dayjs';
import { SourceTrack as ApiSourceTrack } from '../../api/models/source_tracks';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import { Artist } from './artist';
import { Show } from './show';
import { Source } from './source';
import { Year } from './year';
import RNBackgroundDownloader from '@kesha-antonov/react-native-background-downloader';
import { duration, trackDuration } from '@/relisten/util/duration';

export const OFFLINE_DIRECTORY = `${RNBackgroundDownloader.directories.documents}/offline`;

export const OFFLINE_DIRECTORY_LEGACY = `${RNBackgroundDownloader.directories.documents}/offline-mp3s`;
export const OFFLINE_DIRECTORY_LEGACY_CACHE = `${RNBackgroundDownloader.directories.documents}/RelistenCache`;
export const OFFLINE_DIRECTORY_LEGACY_API_CACHE = `${RNBackgroundDownloader.directories.documents}/RelistenApiCache`;
export const OFFLINE_DIRECTORY_LEGACY_LOGS = `${RNBackgroundDownloader.directories.documents}/Logs`;

export const OFFLINE_DIRECTORIES_LEGACY = [
  OFFLINE_DIRECTORY_LEGACY,
  OFFLINE_DIRECTORY_LEGACY_API_CACHE,
  OFFLINE_DIRECTORY_LEGACY_CACHE,
  OFFLINE_DIRECTORY_LEGACY_LOGS,
];

export interface SourceTrackRequiredRelationships {}

export interface SourceTrackRequiredProperties extends RelistenObjectRequiredProperties {
  uuid: string;
  createdAt: Date;
  updatedAt: Date;

  sourceUuid: string;
  sourceSetUuid: string;
  artistUuid: string;
  showUuid: string;

  trackPosition: number;
  duration?: number;
  title: string;
  slug: string;
  mp3Url: string;
  mp3Md5?: string;
  flacUrl?: string;
  flacMd5?: string;
}

export class SourceTrack
  extends Realm.Object<
    SourceTrack,
    keyof SourceTrackRequiredProperties & keyof SourceTrackRequiredRelationships
  >
  implements SourceTrackRequiredRelationships, SourceTrackRequiredProperties
{
  static schema: Realm.ObjectSchema = {
    name: 'SourceTrack',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      createdAt: 'date',
      updatedAt: 'date',
      artistUuid: { type: 'string', indexed: true },
      sourceUuid: { type: 'string', indexed: true },
      sourceSetUuid: { type: 'string', indexed: true },
      showUuid: { type: 'string', indexed: true },

      trackPosition: 'int',
      duration: 'double?',
      title: 'string',
      slug: 'string',
      mp3Url: 'string',
      mp3Md5: 'string?',
      flacUrl: 'string?',
      flacMd5: 'string?',

      isFavorite: { type: 'bool', default: false },

      offlineInfo: 'SourceTrackOfflineInfo',

      artist: 'Artist?',
      year: 'Year?',
      show: 'Show?',
      source: 'Source?',
    },
  };

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;

  sourceUuid!: string;
  sourceSetUuid!: string;
  artistUuid!: string;
  showUuid!: string;
  trackPosition!: number;
  duration?: number;
  title!: string;
  slug!: string;
  mp3Url!: string;
  mp3Md5?: string;
  flacUrl?: string;
  flacMd5?: string;

  isFavorite!: boolean;

  offlineInfo?: SourceTrackOfflineInfo;
  artist!: Artist;
  year!: Year;
  show!: Show;
  source!: Source;

  private _humanizedDuration?: string;
  get humanizedDuration() {
    if (!this._humanizedDuration && this.duration) {
      this._humanizedDuration = trackDuration(this.duration);
    }

    return this._humanizedDuration;
  }

  downloadedFileLocation() {
    return `${OFFLINE_DIRECTORY}/${this.uuid}.mp3`;
  }

  playable(shouldMakeNetworkRequests: boolean) {
    if (shouldMakeNetworkRequests) {
      return true;
    }

    return this.offlineInfo?.isPlayableOffline() === true;
  }

  static propertiesFromApi(relistenObj: ApiSourceTrack): SourceTrackRequiredProperties {
    return {
      uuid: relistenObj.uuid,
      createdAt: dayjs(relistenObj.created_at).toDate(),
      updatedAt: dayjs(relistenObj.updated_at).toDate(),

      sourceUuid: relistenObj.source_uuid,
      sourceSetUuid: relistenObj.source_set_uuid,
      artistUuid: relistenObj.artist_uuid,
      showUuid: relistenObj.show_uuid,
      trackPosition: relistenObj.track_position,
      duration: relistenObj.duration,
      title: relistenObj.title,
      slug: relistenObj.slug,
      mp3Url: relistenObj.mp3_url!,
      mp3Md5: relistenObj.mp3_md5,
      flacUrl: relistenObj.flac_url,
      flacMd5: relistenObj.flac_md5,
    };
  }
}
