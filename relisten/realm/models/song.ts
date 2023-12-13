import Realm from 'realm';
import { SongWithPlayCount } from '../../api/models/song';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import dayjs from 'dayjs';
import { FavoritableObject } from '../favoritable_object';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SongRequiredRelationships {}

export interface SongRequiredProperties extends RelistenObjectRequiredProperties {
  uuid: string;
  createdAt: Date;
  updatedAt: Date;
  artistUuid: string;
  name: string;
  slug: string;
  upstreamIdentifier: string;
  sortName: string;
  showsPlayedAt?: number;
}

export class Song
  extends Realm.Object<Song, keyof SongRequiredProperties & keyof SongRequiredRelationships>
  implements SongRequiredRelationships, SongRequiredProperties, FavoritableObject
{
  static schema: Realm.ObjectSchema = {
    name: 'Song',
    primaryKey: 'uuid',
    properties: {
      createdAt: 'date',
      updatedAt: 'date',
      artistUuid: 'string',
      name: 'string',
      slug: 'string',
      upstreamIdentifier: 'string',
      sortName: 'string',
      uuid: 'string',
      isFavorite: { type: 'bool', default: false },
    },
  };

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;
  artistUuid!: string;
  name!: string;
  slug!: string;
  upstreamIdentifier!: string;
  sortName!: string;
  showPlayedAt?: number;

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
