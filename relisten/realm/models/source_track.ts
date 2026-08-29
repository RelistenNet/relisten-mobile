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
import { LegacyFavoriteMirror } from '@/relisten/realm/legacy_favorite_mirror';

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
  mp3Url?: string;
  mp3Md5?: string;
  flacUrl?: string;
  flacMd5?: string;
}

export class SourceTrack
  extends Realm.Object<SourceTrack, keyof SourceTrackRequiredProperties>
  implements SourceTrackRequiredProperties, LegacyFavoriteMirror
{
  static schema: Realm.ObjectSchema = {
    name: 'SourceTrack',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      createdAt: 'date',
      updatedAt: 'date',
      deletedAt: { type: 'date', optional: true, indexed: true },
      artistUuid: { type: 'string', indexed: true },
      sourceUuid: { type: 'string', indexed: true },
      sourceSetUuid: { type: 'string', indexed: true },
      showUuid: { type: 'string', indexed: true },

      trackPosition: 'int',
      duration: 'double?',
      title: 'string',
      slug: 'string',
      mp3Url: 'string?',
      mp3Md5: 'string?',
      flacUrl: 'string?',
      flacMd5: 'string?',

      // Deprecated compatibility mirror. Canonical membership is in UserFavorite.
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
  deletedAt?: Date;

  sourceUuid!: string;
  sourceSetUuid!: string;
  artistUuid!: string;
  showUuid!: string;
  trackPosition!: number;
  duration?: number;
  title!: string;
  slug!: string;
  mp3Url?: string;
  mp3Md5?: string;
  flacUrl?: string;
  flacMd5?: string;

  /** @deprecated Use `useFavorite` or `LibraryIndex` for active-account membership. */
  isFavorite!: boolean;

  offlineInfo?: SourceTrackOfflineInfo;
  artist!: Artist;
  year!: Year;
  show!: Show;
  source!: Source;

  streamingUrl(): string | undefined {
    // MP3 remains the default because offline validation and storage are MP3
    // specific. A rare FLAC-only catalog row is still streamable instead of
    // becoming impossible to materialize in Realm.
    let url = this.mp3Url || this.flacUrl;
    if (!url) {
      return undefined;
    }

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

    return url;
  }

  supportsOfflineDownload() {
    return !!this.mp3Url;
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
    if (!relistenObj.mp3_url && !relistenObj.flac_url) {
      throw new Error(`Source track ${relistenObj.uuid} has no playable audio URL.`);
    }

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
      mp3Url: relistenObj.mp3_url,
      mp3Md5: relistenObj.mp3_md5,
      flacUrl: relistenObj.flac_url,
      flacMd5: relistenObj.flac_md5,
    };
  }
}
