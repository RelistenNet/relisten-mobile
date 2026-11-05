import Realm from 'realm';

export const TYPED_ACCOUNT_IDENTITY_UPGRADE_VERSION = 1;

/** Completion marker for the one-time private-alpha typed identity reset. */
export class AccountIdentityUpgradeState extends Realm.Object<AccountIdentityUpgradeState> {
  version!: number;
  completedAt!: Date;

  static schema: Realm.ObjectSchema = {
    name: 'AccountIdentityUpgradeState',
    primaryKey: 'version',
    properties: {
      version: 'int',
      completedAt: 'date',
    },
  };
}
