import Realm from 'realm';
import dayjs from 'dayjs';
import { Year as ApiYear } from '../../api/models/year';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import { FavoritableObject } from '../favoritable_object';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface YearRequiredRelationships {}

export interface YearRequiredProperties extends RelistenObjectRequiredProperties {
  artistUuid: string;
  showCount: Realm.Types.Int;
  sourceCount: Realm.Types.Int;
  duration?: Realm.Types.Float;
  avgDuration?: Realm.Types.Float;
  avgRating?: Realm.Types.Float;
  year: string;
}

export class Year
  extends Realm.Object<Year, keyof YearRequiredProperties & keyof YearRequiredRelationships>
  implements YearRequiredRelationships, YearRequiredProperties, FavoritableObject
{
  static schema: Realm.ObjectSchema = {
    name: 'Year',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      createdAt: 'date',
      updatedAt: 'date',
      artistUuid: { type: 'string', indexed: true },
      showCount: 'int',
      sourceCount: 'int',
      duration: 'double?',
      avgDuration: 'double?',
      avgRating: 'double?',
      year: 'string',
      isFavorite: { type: 'bool', default: false },
    },
  };

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;
  artistUuid!: string;
  showCount!: Realm.Types.Int;
  sourceCount!: Realm.Types.Int;
  duration?: Realm.Types.Float;
  avgDuration?: Realm.Types.Float;
  avgRating?: Realm.Types.Float;
  year!: string;
  isFavorite!: boolean;

  static propertiesFromApi(relistenObj: ApiYear): YearRequiredProperties {
    return {
      uuid: relistenObj.uuid,
      artistUuid: relistenObj.artist_uuid,
      createdAt: dayjs(relistenObj.created_at).toDate(),
      updatedAt: dayjs(relistenObj.updated_at).toDate(),
      showCount: relistenObj.show_count,
      sourceCount: relistenObj.source_count,
      duration: relistenObj.duration || undefined,
      avgDuration: relistenObj.avg_duration || undefined,
      avgRating: relistenObj.avg_rating || undefined,
      year: relistenObj.year,
    };
  }
}