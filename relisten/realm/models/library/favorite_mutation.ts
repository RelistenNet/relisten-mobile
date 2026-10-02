import Realm from 'realm';
import type { FavoriteCatalogType } from './favorite_catalog_type';

export enum FavoriteMutationState {
  Pending = 'pending',
  InFlight = 'in_flight',
  NeedsAttention = 'needs_attention',
}

export class FavoriteMutation extends Realm.Object<FavoriteMutation> {
  static schema: Realm.ObjectSchema = {
    name: 'FavoriteMutation',
    primaryKey: 'mutationUuid',
    properties: {
      mutationUuid: 'string',
      scopeId: { type: 'string', indexed: true },
      favoriteUuid: { type: 'string', indexed: true },
      catalogType: { type: 'string', indexed: true },
      catalogUuid: { type: 'string', indexed: true },
      desiredPresent: 'bool',
      localSequence: { type: 'int', indexed: true },
      state: { type: 'string', indexed: true },
      importUuid: { type: 'string', optional: true, indexed: true },
      attemptCount: { type: 'int', default: 0 },
      nextAttemptAt: 'date?',
      requestStartedAt: 'date?',
      lastErrorCode: 'string?',
      lastErrorMessage: 'string?',
      createdAt: 'date',
      updatedAt: 'date',
    },
  };

  mutationUuid!: string;
  scopeId!: string;
  favoriteUuid!: string;
  catalogType!: FavoriteCatalogType;
  catalogUuid!: string;
  desiredPresent!: boolean;
  localSequence!: number;
  state!: FavoriteMutationState;
  importUuid?: string;
  attemptCount!: number;
  nextAttemptAt?: Date;
  requestStartedAt?: Date;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt!: Date;
  updatedAt!: Date;
}
