import Realm from 'realm';
import type { FavoriteTargetKind } from './favorite_catalog_type';

/**
 * Account-owned membership that survives catalog eviction and licensing removal.
 * Catalog references stay as canonical typed IDs instead of Realm links for that reason.
 */
export class UserFavorite extends Realm.Object<UserFavorite> {
  static schema: Realm.ObjectSchema = {
    name: 'UserFavorite',
    primaryKey: 'favoriteId',
    properties: {
      favoriteId: 'string',
      scopeId: { type: 'string', indexed: true },
      targetKind: { type: 'string', indexed: true },
      targetId: { type: 'string', indexed: true },
      acknowledgedPresent: { type: 'bool', default: false },
      effectivePresent: { type: 'bool', default: false, indexed: true },
      acknowledgedRevision: 'int?',
      lastLocalSequence: { type: 'int', default: 0 },
      serverCreatedAt: 'date?',
      serverUpdatedAt: 'date?',
      createdAt: 'date',
      updatedAt: 'date',
    },
  };

  favoriteId!: string;
  scopeId!: string;
  targetKind!: FavoriteTargetKind;
  targetId!: string;
  acknowledgedPresent!: boolean;
  effectivePresent!: boolean;
  acknowledgedRevision?: number;
  lastLocalSequence!: number;
  serverCreatedAt?: Date;
  serverUpdatedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}
