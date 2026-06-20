import Realm from 'realm';

export const ACTIVE_USER_DATA_SCOPE_KEY = '__ACTIVE_USER_DATA_SCOPE__';

export interface ActiveUserDataScopeProps {
  key: string;
  scopeId: string;
  scopeKind: string;
  userUuid?: string;
  deviceId?: string;
  externalProvider?: string;
  externalSubject?: string;
  displayName?: string;
  lastActivatedAt: Date;
}

export class ActiveUserDataScope extends Realm.Object<ActiveUserDataScope> {
  static schema: Realm.ObjectSchema = {
    name: 'ActiveUserDataScope',
    primaryKey: 'key',
    properties: {
      key: 'string',
      scopeId: { type: 'string', indexed: true },
      scopeKind: 'string',
      userUuid: 'string?',
      deviceId: 'string?',
      externalProvider: 'string?',
      externalSubject: 'string?',
      displayName: 'string?',
      lastActivatedAt: 'date',
    },
  };

  key!: string;
  scopeId!: string;
  scopeKind!: string;
  userUuid?: string;
  deviceId?: string;
  externalProvider?: string;
  externalSubject?: string;
  displayName?: string;
  lastActivatedAt!: Date;

  static defaultObject(realm: Realm): ActiveUserDataScope | null {
    return realm.objectForPrimaryKey(ActiveUserDataScope, ACTIVE_USER_DATA_SCOPE_KEY);
  }
}
