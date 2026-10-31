import { AccountCredentials } from './account_credentials';
import { AccountError, isTerminalRefreshFailure, toAccountError } from './account_errors';
import {
  AccountScopeCapture,
  AccountScopeStore,
  StaleAccountScopeError,
} from './account_scope_store';
import { AccountProfileSnapshot } from './api/account_profile';

export interface AccountRestoreResult {
  status: 'signedIn' | 'signedOut' | 'error';
  profile: AccountProfileSnapshot | null;
  error: AccountError | null;
}

export class AccountSessionRestorer {
  constructor(
    private readonly credentials: AccountCredentials,
    private readonly scopeStore: AccountScopeStore,
    private readonly currentEpoch: () => number,
    private readonly beforeLeavingAuthenticatedScope: () => Promise<void>,
    private readonly cachedSessionAvailable: (profile: AccountProfileSnapshot) => void
  ) {}

  async restore(epoch: number): Promise<AccountRestoreResult | null> {
    const cachedScope = this.scopeStore.getSnapshot();
    const cachedProfile = this.scopeStore.activeProfile();
    this.credentials.clearMemory();

    let stored;

    try {
      stored = await this.credentials.readStored();
    } catch {
      if (!this.isCurrent(epoch, cachedScope)) {
        return null;
      }

      await this.credentials.clearPersisted().catch(() => undefined);

      if (!(await this.leaveCachedScope(epoch, cachedScope))) {
        return null;
      }

      return {
        status: 'error',
        profile: null,
        error: {
          code: 'stored_session_invalid',
          message: 'The saved Relisten session could not be read.',
          retryable: false,
        },
      };
    }

    if (!this.isCurrent(epoch, cachedScope)) {
      return null;
    }

    if (stored.state === 'temporarilyUnavailable') {
      return {
        status: cachedScope.isAuthenticated && cachedProfile ? 'signedIn' : 'error',
        profile: cachedProfile,
        error: {
          code: 'credentials_temporarily_unavailable',
          message: 'Unlock this device to restore your Relisten account.',
          retryable: true,
        },
      };
    }

    if (
      stored.state === 'missing' ||
      (stored.state === 'available' &&
        this.scopeStore.isSessionBlocked(stored.value.nativeSessionId))
    ) {
      if (stored.state === 'available') {
        await this.credentials.clearPersisted().catch(() => undefined);
      }

      if (!(await this.leaveCachedScope(epoch, cachedScope))) {
        return null;
      }

      return { status: 'signedOut', profile: null, error: null };
    }

    this.credentials.stageEnvelope(stored.value);

    if (cachedScope.isAuthenticated && cachedProfile) {
      // Local account data is useful without a network. Let the app render it while the
      // protected refresh token is rotated and validated in the background.
      this.cachedSessionAvailable(cachedProfile);
    }

    try {
      const credentials = await this.credentials.rotate(stored.value, () => {
        this.assertCurrent(epoch, cachedScope);
      });
      this.assertCurrent(epoch, cachedScope);

      this.scopeStore.promote(credentials.profile);
      this.credentials.activate(credentials);
      return { status: 'signedIn', profile: credentials.profile, error: null };
    } catch (error) {
      if (!this.isCurrent(epoch, cachedScope)) {
        return null;
      }

      const isTerminal = isTerminalRefreshFailure(error);

      if (isTerminal) {
        if (cachedScope.isAuthenticated) {
          await this.beforeLeavingAuthenticatedScope();
        }

        if (!this.isCurrent(epoch, cachedScope)) {
          return null;
        }

        await this.credentials.clearPersisted().catch(() => undefined);

        if (!this.isCurrent(epoch, cachedScope)) {
          return null;
        }

        this.scopeStore.selectAnonymous(true, stored.value.nativeSessionId);
      }

      return {
        status: !isTerminal && cachedScope.isAuthenticated && cachedProfile ? 'signedIn' : 'error',
        profile: !isTerminal ? cachedProfile : null,
        error: toAccountError(error, 'session_restore_failed'),
      };
    }
  }

  private isCurrent(epoch: number, capture: AccountScopeCapture) {
    return epoch === this.currentEpoch() && this.scopeStore.isCurrent(capture);
  }

  private assertCurrent(epoch: number, capture: AccountScopeCapture) {
    if (!this.isCurrent(epoch, capture)) {
      throw new StaleAccountScopeError();
    }
  }

  private async leaveCachedScope(epoch: number, cachedScope: AccountScopeCapture) {
    if (!cachedScope.isAuthenticated) {
      return this.isCurrent(epoch, cachedScope);
    }

    await this.beforeLeavingAuthenticatedScope();

    if (!this.isCurrent(epoch, cachedScope)) {
      return false;
    }

    this.scopeStore.selectAnonymous(true, cachedScope.nativeSessionId ?? undefined);
    return true;
  }
}
