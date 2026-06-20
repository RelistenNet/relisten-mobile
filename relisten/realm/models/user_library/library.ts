import Realm from 'realm';

export enum UserFavoriteEntityType {
  Artist = 'artist',
  Show = 'show',
  Source = 'source',
  SourceTrack = 'source_track',
  Tour = 'tour',
  Song = 'song',
}

export class UserFavorite extends Realm.Object<UserFavorite> {
  static schema: Realm.ObjectSchema = {
    name: 'UserFavorite',
    primaryKey: 'scopedId',
    properties: {
      scopedId: 'string',
      scopeId: { type: 'string', indexed: true },
      entityType: { type: 'string', indexed: true },
      entityUuid: { type: 'string', indexed: true },
      createdAt: 'date',
      updatedAt: 'date',
      deletedAt: 'date?',
    },
  };

  scopedId!: string;
  scopeId!: string;
  entityType!: UserFavoriteEntityType;
  entityUuid!: string;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date;
}

export class ScopedUserSettings extends Realm.Object<ScopedUserSettings> {
  static schema: Realm.ObjectSchema = {
    name: 'ScopedUserSettings',
    primaryKey: 'scopedId',
    properties: {
      scopedId: 'string',
      scopeId: { type: 'string', indexed: true },
      settingsKey: 'string',
      settingsJson: 'string',
      updatedAt: 'date',
    },
  };

  scopedId!: string;
  scopeId!: string;
  settingsKey!: string;
  settingsJson!: string;
  updatedAt!: Date;
}
