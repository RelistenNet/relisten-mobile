import Realm from 'realm';

export enum AnonymousFavoriteImportState {
  Deferred = 'deferred',
  Importing = 'importing',
  Completed = 'completed',
}

export class AnonymousFavoriteImport extends Realm.Object<AnonymousFavoriteImport> {
  static schema: Realm.ObjectSchema = {
    name: 'AnonymousFavoriteImport',
    primaryKey: 'importUuid',
    properties: {
      importUuid: 'string',
      installationUuid: { type: 'string', indexed: true },
      destinationScopeId: { type: 'string', indexed: true },
      sourceFingerprint: 'string',
      state: { type: 'string', indexed: true },
      sourceFavoriteCount: 'int',
      createdAt: 'date',
      updatedAt: 'date',
      completedAt: 'date?',
    },
  };

  importUuid!: string;
  installationUuid!: string;
  destinationScopeId!: string;
  sourceFingerprint!: string;
  state!: AnonymousFavoriteImportState;
  sourceFavoriteCount!: number;
  createdAt!: Date;
  updatedAt!: Date;
  completedAt?: Date;
}
