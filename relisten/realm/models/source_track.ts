import Realm from 'realm';

import { SourceTrackOfflineInfo } from '@/relisten/realm/models/source_track_offline_info';
import dayjs from 'dayjs';
import { SourceTrack as ApiSourceTrack } from '../../api/models/source_tracks';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import { Artist } from './artist';
import { Show } from './show';
import { Source } from './source';
import { Year } from './year';
import { trackDuration } from '@/relisten/util/duration';
import { Paths } from 'expo-file-system';
import { sharedStatsigClient } from '@/relisten/events';

export const OFFLINE_DIRECTORY = Paths.join(Paths.document, 'offline');

export const OFFLINE_DIRECTORY_LEGACY = Paths.join(Paths.document, 'offline-mp3s');
export const OFFLINE_DIRECTORY_LEGACY_CACHE = Paths.join(Paths.document, 'RelistenCache');
export const OFFLINE_DIRECTORY_LEGACY_API_CACHE = Paths.join(Paths.document, 'RelistenApiCache');
export const OFFLINE_DIRECTORY_LEGACY_LOGS = Paths.join(Paths.document, 'Logs');

export const OFFLINE_DIRECTORIES_LEGACY = [
  OFFLINE_DIRECTORY_LEGACY,
  OFFLINE_DIRECTORY_LEGACY_API_CACHE,
  OFFLINE_DIRECTORY_LEGACY_CACHE,
  OFFLINE_DIRECTORY_LEGACY_LOGS,
];

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
  extends Realm.Object<SourceTrack, keyof SourceTrackRequiredProperties>
  implements SourceTrackRequiredProperties
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

  _streamingUrl: string | undefined;
  streamingUrl() {
    // TODO: allow people to prefer FLAC

    if (!this._streamingUrl) {
      let url = this.mp3Url;

      const proxyConfig = sharedStatsigClient().getDynamicConfig(
        'proxy_audio_through_audio.relisten.net'
      );
      const urlReplacements = proxyConfig.get('url_replacements', {
        '://archive.org/': '://audio.relisten.net/archive.org/',
        '://phish.in/': '://audio.relisten.net/phish.in/',
      });

      for (const [key, value] of Object.entries(urlReplacements)) {
        url = url.replace(key, value);
      }

      this._streamingUrl = url;
    }

    return this._streamingUrl;
  }

  private _humanizedDuration?: string;
  get humanizedDuration() {
    if (!this._humanizedDuration && this.duration) {
      this._humanizedDuration = trackDuration(this.duration);
    }

    return this._humanizedDuration;
  }

  downloadedFileLocation() {
    return Paths.join(OFFLINE_DIRECTORY, `${this.uuid}.mp3`);
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
