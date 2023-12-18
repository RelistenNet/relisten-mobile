import Realm from 'realm';

import { DownloadPauseState, DownloadProgressData, documentDirectory } from 'expo-file-system';

import { SourceTrack as ApiSourceTrack } from '../../api/models/source_tracks';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import dayjs from 'dayjs';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
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
      downloadPauseState: {
        type: 'dictionary',
        objectType: 'SourceTrackDownloadPauseState',
        optional: true,
      },
      totalBytesExpectedToWrite: { type: 'int', optional: true },
      totalBytesWritten: { type: 'int', optional: true },
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
  downloadPauseState?: Omit<DownloadPauseState, 'options'>;
  totalBytesWritten?: DownloadProgressData['totalBytesWritten'];
  totalBytesExpectedToWrite?: DownloadProgressData['totalBytesExpectedToWrite'];

  private _humanizedDuration?: string;
  get humanizedDuration() {
    if (!this._humanizedDuration && this.duration) {
      this._humanizedDuration = dayjs.duration(this.duration, 'seconds').format('mm:ss');
    }

    return this._humanizedDuration;
  }

  get downloadProgress() {
    if (!this.totalBytesExpectedToWrite || !this.totalBytesWritten) return 0;
    return Number((this.totalBytesWritten / this.totalBytesExpectedToWrite) * 100).toFixed(2);
  }

  get filePath() {
    return `${documentDirectory}/audio/${this.uuid}.mp3`;
  }

  static SourceTrackDownloadPauseState: Realm.ObjectSchema = {
    name: 'SourceTrackDownloadPauseState',
    properties: {
      url: { type: 'string' },
      fileUri: { type: 'string' },
      resumeData: { type: 'string', optional: true },
    },
  };

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
