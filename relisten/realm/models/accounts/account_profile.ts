import Realm from 'realm';

export class AccountProfile extends Realm.Object<AccountProfile> {
  scopeId!: string;
  userUuid!: string;
  username!: string;
  usernameVersion!: number;
  usernameReviewNeeded!: boolean;
  usernameReviewedAt?: Date;
  usernameChangeAvailableAt?: Date;
  nativeSessionId!: string;
  lastSyncedAt!: Date;

  static schema: Realm.ObjectSchema = {
    name: 'AccountProfile',
    primaryKey: 'scopeId',
    properties: {
      scopeId: 'string',
      userUuid: 'string',
      username: 'string',
      usernameVersion: 'int',
      usernameReviewNeeded: 'bool',
      usernameReviewedAt: 'date?',
      usernameChangeAvailableAt: 'date?',
      nativeSessionId: 'string',
      lastSyncedAt: 'date',
    },
  };
}
