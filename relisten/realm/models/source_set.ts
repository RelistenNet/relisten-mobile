import Realm from 'realm';

import { SourceSet as ApiSourceSet } from '../../api/models/source_set';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import dayjs from 'dayjs';
import type { SourceTrack } from './source_track';
import {
  CATALOG_RETIREMENT_SCHEMA_PROPERTIES,
  CatalogRetirementState,
} from '@/relisten/realm/catalog_retirement_schema';

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
  extends Realm.Object<SourceSet, keyof SourceSetRequiredProperties>
  implements SourceSetRequiredProperties, CatalogRetirementState
{
  static schema: Realm.ObjectSchema = {
    name: 'SourceSet',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      createdAt: 'date',
      updatedAt: 'date',
      ...CATALOG_RETIREMENT_SCHEMA_PROPERTIES,
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
  retiredAt?: Date;
  retirementReason?: string;

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
