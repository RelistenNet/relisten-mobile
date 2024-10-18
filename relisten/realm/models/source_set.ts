import Realm from 'realm';

import { SourceSet as ApiSourceSet } from '../../api/models/source_set';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import dayjs from 'dayjs';
import type { SourceTrack } from './source_track';

export interface SourceSetRequiredRelationships {}

export interface SourceSetRequiredProperties extends RelistenObjectRequiredProperties {
  uuid: string;
  createdAt: Date;
  updatedAt: Date;

  artistUuid: string;
  sourceUuid: string;

  index: number;
  isEncore: boolean;
  name: string;
}

export class SourceSet
  extends Realm.Object<
    SourceSet,
    keyof SourceSetRequiredProperties & keyof SourceSetRequiredRelationships
  >
  implements SourceSetRequiredRelationships, SourceSetRequiredProperties
{
  static schema: Realm.ObjectSchema = {
    name: 'SourceSet',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      createdAt: 'date',
      updatedAt: 'date',
      artistUuid: { type: 'string', indexed: true },
      sourceUuid: { type: 'string', indexed: true },

      index: 'int',
      isEncore: 'bool',
      name: 'string',

      sourceTracks: 'SourceTrack[]',
    },
  };

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;

  artistUuid!: string;
  sourceUuid!: string;

  index!: number;
  isEncore!: boolean;
  name!: string;

  sourceTracks!: Realm.List<SourceTrack>;

  static propertiesFromApi(relistenObj: ApiSourceSet): SourceSetRequiredProperties {
    return {
      uuid: relistenObj.uuid,
      createdAt: dayjs(relistenObj.created_at).toDate(),
      updatedAt: dayjs(relistenObj.updated_at).toDate(),
      artistUuid: relistenObj.artist_uuid,
      sourceUuid: relistenObj.source_uuid,
      index: relistenObj.index,
      isEncore: relistenObj.is_encore,
      name: relistenObj.name,
    };
  }
}
