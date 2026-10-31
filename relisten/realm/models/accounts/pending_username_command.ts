import Realm from 'realm';

export class PendingUsernameCommand extends Realm.Object<PendingUsernameCommand> {
  scopeId!: string;
  commandId!: string;
  expectedUsernameVersion!: number;
  username!: string;
  createdAt!: Date;

  static schema: Realm.ObjectSchema = {
    name: 'PendingUsernameCommand',
    primaryKey: 'scopeId',
    properties: {
      scopeId: 'string',
      commandId: 'string',
      expectedUsernameVersion: 'int',
      username: 'string',
      createdAt: 'date',
    },
  };
}
