import Realm from 'realm';
import { SongWithPlayCount } from '../../api/models/song';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import dayjs from 'dayjs';
import { LegacyFavoriteMirror } from '../legacy_favorite_mirror';
import type { Show } from '@/relisten/realm/models/show';

export interface SongRequiredProperties extends RelistenObjectRequiredProperties {
  uuid: string;
  createdAt: Date;
  updatedAt: Date;
  artistUuid: string;
  name: string;
  slug: string;
  upstreamIdentifier: string;
  sortName: string;
  showsPlayedAt: number;
}

export class Song
  extends Realm.Object<Song, keyof SongRequiredProperties>
  implements SongRequiredProperties, LegacyFavoriteMirror
{
  static schema: Realm.ObjectSchema = {
    name: 'Song',
    primaryKey: 'uuid',
    properties: {
      createdAt: 'date',
      updatedAt: 'date',
      deletedAt: { type: 'date', optional: true, indexed: true },
      artistUuid: 'string',
      name: 'string',
      slug: 'string',
      upstreamIdentifier: 'string',
      sortName: 'string',
      uuid: 'string',
      showsPlayedAt: 'int',
      // Deprecated compatibility mirror. Canonical membership is in UserFavorite.
      isFavorite: { type: 'bool', default: false },
      shows: {
        type: 'set',
        objectType: 'Show',
      },
    },
  };

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date;
  artistUuid!: string;
  name!: string;
  slug!: string;
  upstreamIdentifier!: string;
  sortName!: string;
  showsPlayedAt!: number;

  shows!: Realm.Set<Show>;

  /** @deprecated Use `useFavorite` or `LibraryIndex` for active-account membership. */
  isFavorite!: boolean;

  static propertiesFromApi(relistenObj: SongWithPlayCount): SongRequiredProperties {
    return {
      uuid: relistenObj.uuid,
      createdAt: dayjs(relistenObj.created_at).toDate(),
      updatedAt: dayjs(relistenObj.updated_at).toDate(),
      artistUuid: relistenObj.artist_uuid,
      name: relistenObj.name,
      upstreamIdentifier: relistenObj.upstream_identifier,
      slug: relistenObj.slug,
      sortName: relistenObj.sortName,
      showsPlayedAt: relistenObj.shows_played_at,
    };
  }
}
