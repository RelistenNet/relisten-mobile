import Realm from 'realm';

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

      trackPosition: 'int',
      duration: 'double?',
      title: 'string',
      slug: 'string',
      mp3Url: 'string',
      mp3Md5: 'string?',
      flacUrl: 'string?',
      flacMd5: 'string?',

      isFavorite: { type: 'bool', default: false },
    },
  };

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;

  sourceUuid!: string;
  sourceSetUuid!: string;
  artistUuid!: string;
  trackPosition!: number;
  duration?: number;
  title!: string;
  slug!: string;
  mp3Url!: string;
  mp3Md5?: string;
  flacUrl?: string;
  flacMd5?: string;

  isFavorite!: boolean;

  private _humanizedDuration?: string;
  humanizedDuration() {
    if (!this._humanizedDuration && this.duration) {
      this._humanizedDuration = dayjs.duration(this.duration, 'seconds').format('mm:ss');
    }

    return this._humanizedDuration;
  }

  static propertiesFromApi(relistenObj: ApiSourceTrack): SourceTrackRequiredProperties {
    return {
      uuid: relistenObj.uuid,
      createdAt: dayjs(relistenObj.created_at).toDate(),
      updatedAt: dayjs(relistenObj.updated_at).toDate(),

      sourceUuid: relistenObj.source_uuid,
      sourceSetUuid: relistenObj.source_set_uuid,
      artistUuid: relistenObj.artist_uuid,
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