import Realm from 'realm';
import type { FavoriteTargetKind } from './favorite_catalog_type';

export enum FavoriteMutationState {
  Pending = 'pending',
  InFlight = 'in_flight',
  NeedsAttention = 'needs_attention',
}

export class FavoriteMutation extends Realm.Object<FavoriteMutation> {
  static schema: Realm.ObjectSchema = {
    name: 'FavoriteMutation',
    primaryKey: 'mutationId',
    properties: {
      mutationId: 'string',
      scopeId: { type: 'string', indexed: true },
      favoriteId: { type: 'string', indexed: true },
      targetKind: { type: 'string', indexed: true },
      targetId: { type: 'string', indexed: true },
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

  mutationId!: string;
  scopeId!: string;
  favoriteId!: string;
  targetKind!: FavoriteTargetKind;
  targetId!: string;
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
