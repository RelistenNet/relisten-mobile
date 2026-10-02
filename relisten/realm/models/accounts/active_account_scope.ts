import Realm from 'realm';

export const ACTIVE_ACCOUNT_SCOPE_ID = '__ACTIVE_ACCOUNT_SCOPE__';
export const ANONYMOUS_ACCOUNT_SCOPE_ID = 'anonymous';

export class ActiveAccountScope extends Realm.Object<ActiveAccountScope> {
  id!: string;
  scopeId!: string;
  userUuid?: string;
  generation!: number;
  nativeSessionId?: string;
  blockedNativeSessionId?: string;
  updatedAt!: Date;

  static schema: Realm.ObjectSchema = {
    name: 'ActiveAccountScope',
    primaryKey: 'id',
    properties: {
      id: 'string',
      scopeId: 'string',
      userUuid: 'string?',
      generation: { type: 'int', default: 0 },
      nativeSessionId: 'string?',
      blockedNativeSessionId: 'string?',
      updatedAt: 'date',
    },
  };
}
