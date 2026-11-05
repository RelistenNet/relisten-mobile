import Realm from 'realm';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import { LegacyFavoriteMirror } from '../legacy_favorite_mirror';

export interface TourRequiredProperties extends RelistenObjectRequiredProperties {
  uuid: string;
  createdAt: Date;
  updatedAt: Date;
  artistUuid: string;
  startDate?: Date;
  endDate?: Date;
  name: string;
  slug: string;
  upstreamIdentifier: string;
  showCount: number;
}

export class Tour
  extends Realm.Object<Tour, keyof TourRequiredProperties>
  implements TourRequiredProperties, LegacyFavoriteMirror
{
  static schema: Realm.ObjectSchema = {
    name: 'Tour',
    primaryKey: 'uuid',
    properties: {
      createdAt: 'date',
      updatedAt: 'date',
      deletedAt: { type: 'date', optional: true, indexed: true },
      artistUuid: 'string',
      startDate: 'date?',
      endDate: 'date?',
      name: 'string',
      slug: 'string',
      upstreamIdentifier: 'string',
      showCount: { type: 'int', default: 0 },
      uuid: 'string',
      // Deprecated compatibility mirror. Canonical membership is in UserFavorite.
      isFavorite: { type: 'bool', default: false },
    },
  };

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date;
  artistUuid!: string;
  startDate?: Date;
  endDate?: Date;
  name!: string;
  slug!: string;
  upstreamIdentifier!: string;
  showCount!: number;

  /** @deprecated Use `useFavorite` or `LibraryIndex` for active-account membership. */
  isFavorite!: boolean;
}
