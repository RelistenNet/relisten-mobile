import Realm from 'realm';
import type { FavoriteCatalogType } from './favorite_catalog_type';

export enum FavoriteMetadataStatus {
  Unknown = 'unknown',
  Available = 'available',
  Unavailable = 'unavailable',
}

/**
 * Account-owned membership that survives catalog eviction and licensing removal.
 * Catalog references stay as UUID strings instead of Realm links for that reason.
 */
export class UserFavorite extends Realm.Object<UserFavorite> {
  static schema: Realm.ObjectSchema = {
    name: 'UserFavorite',
    primaryKey: 'favoriteUuid',
    properties: {
      favoriteUuid: 'string',
      scopeId: { type: 'string', indexed: true },
      catalogType: { type: 'string', indexed: true },
      catalogUuid: { type: 'string', indexed: true },
      acknowledgedPresent: { type: 'bool', default: false },
      effectivePresent: { type: 'bool', default: false, indexed: true },
      acknowledgedRevision: 'int?',
      lastLocalSequence: { type: 'int', default: 0 },
      metadataStatus: { type: 'string', default: FavoriteMetadataStatus.Unknown },
      serverCreatedAt: 'date?',
      serverUpdatedAt: 'date?',
      createdAt: 'date',
      updatedAt: 'date',
    },
  };

  favoriteUuid!: string;
  scopeId!: string;
  catalogType!: FavoriteCatalogType;
  catalogUuid!: string;
  acknowledgedPresent!: boolean;
  effectivePresent!: boolean;
  acknowledgedRevision?: number;
  lastLocalSequence!: number;
  metadataStatus!: FavoriteMetadataStatus;
  serverCreatedAt?: Date;
  serverUpdatedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}
