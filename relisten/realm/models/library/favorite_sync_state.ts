import Realm from 'realm';

export enum FavoriteSyncRunStatus {
  Waiting = 'waiting',
  Syncing = 'syncing',
  Saved = 'saved',
  NeedsAttention = 'needs_attention',
}

export class FavoriteSyncState extends Realm.Object<FavoriteSyncState> {
  static schema: Realm.ObjectSchema = {
    name: 'FavoriteSyncState',
    primaryKey: 'syncStateUuid',
    properties: {
      syncStateUuid: 'string',
      scopeId: { type: 'string', indexed: true },
      libraryCursor: 'string?',
      highestObservedLibraryRevision: { type: 'int', default: 0 },
      nextLocalSequence: { type: 'int', default: 1 },
      runStatus: { type: 'string', default: FavoriteSyncRunStatus.Waiting },
      lastErrorCode: 'string?',
      lastErrorMessage: 'string?',
      lastSuccessfulSyncAt: 'date?',
      createdAt: 'date',
      updatedAt: 'date',
    },
  };

  syncStateUuid!: string;
  scopeId!: string;
  libraryCursor?: string;
  highestObservedLibraryRevision!: number;
  nextLocalSequence!: number;
  runStatus!: FavoriteSyncRunStatus;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastSuccessfulSyncAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}
