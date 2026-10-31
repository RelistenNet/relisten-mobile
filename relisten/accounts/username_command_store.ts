import Realm from 'realm';
import { AccountScopeCapture, StaleAccountScopeError } from './account_scope_store';
import { PendingUsernameCommand } from '@/relisten/realm/models/accounts';
import { createUuidV7 } from '@/relisten/util/uuid_v7';

export interface UsernameCommandSnapshot {
  scopeId: string;
  commandUuid: string;
  expectedUsernameVersion: number;
  username: string;
}

function snapshot(command: PendingUsernameCommand): UsernameCommandSnapshot {
  return {
    scopeId: command.scopeId,
    commandUuid: command.commandUuid,
    expectedUsernameVersion: command.expectedUsernameVersion,
    username: command.username,
  };
}

export class UsernameCommandStore {
  constructor(private readonly realm: Realm) {}

  pending(scopeId: string): UsernameCommandSnapshot | null {
    const command = this.realm.objectForPrimaryKey(PendingUsernameCommand, scopeId);
    return command ? snapshot(command) : null;
  }

  create(capture: AccountScopeCapture, username: string, expectedVersion: number) {
    if (!capture.isAuthenticated) {
      throw new StaleAccountScopeError();
    }

    const command: UsernameCommandSnapshot = {
      scopeId: capture.scopeId,
      commandUuid: createUuidV7(),
      expectedUsernameVersion: expectedVersion,
      username,
    };

    this.realm.write(() => {
      this.realm.create(PendingUsernameCommand, {
        ...command,
        createdAt: new Date(),
      });
    });

    return command;
  }

  clear(command: UsernameCommandSnapshot) {
    const stored = this.realm.objectForPrimaryKey(PendingUsernameCommand, command.scopeId);

    if (!stored || stored.commandUuid !== command.commandUuid) {
      return;
    }

    this.realm.write(() => this.realm.delete(stored));
  }
}
