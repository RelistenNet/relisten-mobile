import Realm from 'realm';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import { checkIfOfflineSourceTrackExists } from '../realm_filters';
import { SourceTrack } from './source_track';
import { Popularity } from './popularity';
import type { LibraryIndex } from '@/relisten/realm/library_index';

export interface YearRequiredProperties extends RelistenObjectRequiredProperties {
  artistUuid: string;
  showCount: Realm.Types.Int;
  sourceCount: Realm.Types.Int;
  duration?: Realm.Types.Float;
  avgDuration?: Realm.Types.Float;
  avgRating?: Realm.Types.Float;
  year: string;
  popularity?: Popularity;
}

export class Year
  extends Realm.Object<Year, keyof YearRequiredProperties>
  implements YearRequiredProperties
{
  static schema: Realm.ObjectSchema = {
    name: 'Year',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      createdAt: 'date',
      updatedAt: 'date',
      deletedAt: { type: 'date', optional: true, indexed: true },
      artistUuid: { type: 'string', indexed: true },
      showCount: 'int',
      sourceCount: 'int',
      duration: 'double?',
      avgDuration: 'double?',
      avgRating: 'double?',
      year: 'string',
      popularity: 'Popularity?',
      sourceTracks: {
        type: 'linkingObjects',
        objectType: 'SourceTrack',
        property: 'year',
      },
    },
  };

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date;
  artistUuid!: string;
  showCount!: Realm.Types.Int;
  sourceCount!: Realm.Types.Int;
  duration?: Realm.Types.Float;
  avgDuration?: Realm.Types.Float;
  avgRating?: Realm.Types.Float;
  year!: string;
  popularity?: Popularity;
  sourceTracks!: Realm.List<SourceTrack>;

  hasOfflineTracks(libraryIndex?: Pick<LibraryIndex, 'yearHasOfflineTracks'>) {
    return libraryIndex
      ? libraryIndex.yearHasOfflineTracks(this.uuid)
      : checkIfOfflineSourceTrackExists(this.sourceTracks);
  }
}
