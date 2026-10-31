import Realm from 'realm';
import { AccountScopeCapture, StaleAccountScopeError } from './account_scope_store';
import { PendingUsernameCommand } from '@/relisten/realm/models/accounts';
import { createUuidV7TypedId } from '@/relisten/util/typed_uuid_id';

export interface UsernameCommandSnapshot {
  scopeId: string;
  commandId: string;
  expectedUsernameVersion: number;
  username: string;
}

function snapshot(command: PendingUsernameCommand): UsernameCommandSnapshot {
  return {
    scopeId: command.scopeId,
    commandId: command.commandId,
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
      commandId: createUuidV7TypedId('command'),
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

    if (!stored || stored.commandId !== command.commandId) {
      return;
    }

    this.realm.write(() => this.realm.delete(stored));
  }
}
