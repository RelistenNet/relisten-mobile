import Realm from 'realm';

// Token material belongs in SecureStore; Realm stores only non-secret session metadata.
export class UserAuthSessionMetadata extends Realm.Object<UserAuthSessionMetadata> {
  static schema: Realm.ObjectSchema = {
    name: 'UserAuthSessionMetadata',
    primaryKey: 'scopedId',
    properties: {
      scopedId: 'string',
      scopeId: { type: 'string', indexed: true },
      userUuid: { type: 'string', indexed: true, optional: true },
      sessionUuid: 'string?',
      deviceId: 'string?',
      provider: 'string?',
      username: 'string?',
      displayName: 'string?',
      lastAuthenticatedAt: 'date',
      lastRefreshAt: 'date?',
      signedOutAt: 'date?',
    },
  };

  scopedId!: string;
  scopeId!: string;
  userUuid?: string;
  sessionUuid?: string;
  deviceId?: string;
  provider?: string;
  username?: string;
  displayName?: string;
  lastAuthenticatedAt!: Date;
  lastRefreshAt?: Date;
  signedOutAt?: Date;
}
