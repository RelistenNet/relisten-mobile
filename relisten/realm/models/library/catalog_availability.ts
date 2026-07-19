import Realm from 'realm';
import type { FavoriteCatalogType } from './favorite_catalog_type';

export enum CatalogAvailabilityStatus {
  Available = 'available',
  Unavailable = 'unavailable',
}

/**
 * Last explicit availability answer from the catalog resolver.
 *
 * Absence is intentionally the "unknown, allow" state. Existing installs have
 * useful cached catalog rows before this table exists, and a failed resolver
 * request must never turn those rows into false licensing removals.
 */
export class CatalogAvailability extends Realm.Object<CatalogAvailability> {
  static schema: Realm.ObjectSchema = {
    name: 'CatalogAvailability',
    primaryKey: 'targetKey',
    properties: {
      targetKey: 'string',
      catalogType: { type: 'string', indexed: true },
      catalogUuid: { type: 'string', indexed: true },
      status: { type: 'string', indexed: true },
      checkedAt: 'date',
    },
  };

  targetKey!: string;
  catalogType!: FavoriteCatalogType;
  catalogUuid!: string;
  status!: CatalogAvailabilityStatus;
  checkedAt!: Date;
}

export function catalogAvailabilityKey(catalogType: FavoriteCatalogType, catalogUuid: string) {
  return `${catalogType}:${catalogUuid}`;
}
