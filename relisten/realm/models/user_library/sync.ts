import Realm from 'realm';

export enum UserDataSyncStatus {
  Pending = 'pending',
  Syncing = 'syncing',
  Synced = 'synced',
  Failed = 'failed',
}

export class PendingUserOperation extends Realm.Object<PendingUserOperation> {
  static schema: Realm.ObjectSchema = {
    name: 'PendingUserOperation',
    primaryKey: 'scopedId',
    properties: {
      scopedId: 'string',
      scopeId: { type: 'string', indexed: true },
      uuid: { type: 'string', indexed: true },
      operationType: 'string',
      entityType: 'string',
      entityUuid: 'string?',
      operationJson: 'string',
      baseRevision: 'int?',
      syncStatus: 'string',
      attemptCount: { type: 'int', default: 0 },
      createdAt: 'date',
      updatedAt: 'date',
      lastAttemptedAt: 'date?',
      lastError: 'string?',
    },
  };

  scopedId!: string;
  scopeId!: string;
  uuid!: string;
  operationType!: string;
  entityType!: string;
  entityUuid?: string;
  operationJson!: string;
  baseRevision?: number;
  syncStatus!: UserDataSyncStatus;
  attemptCount!: number;
  createdAt!: Date;
  updatedAt!: Date;
  lastAttemptedAt?: Date;
  lastError?: string;
}

export class UserSyncCursor extends Realm.Object<UserSyncCursor> {
  static schema: Realm.ObjectSchema = {
    name: 'UserSyncCursor',
    primaryKey: 'scopedId',
    properties: {
      scopedId: 'string',
      scopeId: { type: 'string', indexed: true },
      cursorName: 'string',
      cursor: 'string?',
      updatedAt: 'date',
    },
  };

  scopedId!: string;
  scopeId!: string;
  cursorName!: string;
  cursor?: string;
  updatedAt!: Date;
}

export class UserDataMigrationMarker extends Realm.Object<UserDataMigrationMarker> {
  static schema: Realm.ObjectSchema = {
    name: 'UserDataMigrationMarker',
    primaryKey: 'scopedId',
    properties: {
      scopedId: 'string',
      scopeId: { type: 'string', indexed: true },
      marker: 'string',
      completedAt: 'date',
      detailsJson: 'string?',
    },
  };

  scopedId!: string;
  scopeId!: string;
  marker!: string;
  completedAt!: Date;
  detailsJson?: string;
}
