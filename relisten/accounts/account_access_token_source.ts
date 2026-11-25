import {
  AccountScopeCapture,
  AccountScopeStore,
  StaleAccountScopeError,
} from './account_scope_store';
import { AccountCredentials } from './account_credentials';
import { isTerminalRefreshFailure } from './account_errors';
import { AccountsApiError, AccountTokenSource } from './api/accounts_api_client';
import { AccountProfileSnapshot } from './api/account_profile';

const ACCESS_TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

interface AccountTokenLifecycle {
  currentEpoch(): number;
  isTransitioning(): boolean;
  isRestoring(): boolean;
  /** Settles when the launch restore finishes, or null when none is running. */
  restoreFinished(): Promise<void> | null;
  profileRefreshed(profile: AccountProfileSnapshot): void;
  sessionExpired(nativeSessionId: string): Promise<void>;
}

interface RefreshOperation {
  capture: AccountScopeCapture;
  promise: Promise<string>;
}

function capturesSameScope(left: AccountScopeCapture, right: AccountScopeCapture) {
  return (
    left.scopeId === right.scopeId &&
    left.generation === right.generation &&
    left.nativeSessionId === right.nativeSessionId
  );
}

export class AccountAccessTokenSource implements AccountTokenSource {
  private refreshOperation: RefreshOperation | null = null;

  constructor(
    private readonly credentials: AccountCredentials,
    private readonly scopeStore: AccountScopeStore,
    private readonly lifecycle: AccountTokenLifecycle
  ) {}

  async getAccessToken(capture: AccountScopeCapture, forceRefresh = false): Promise<string> {
    if (this.lifecycle.isTransitioning() || !this.scopeStore.isCurrent(capture)) {
      throw new StaleAccountScopeError();
    }

    const accessToken = forceRefresh
      ? null
      : this.credentials.freshAccessToken(capture, ACCESS_TOKEN_REFRESH_MARGIN_MS);

    if (accessToken) {
      return accessToken;
    }

    // At launch the app renders the cached account while the restore rotates
    // the stored refresh token. A request made meanwhile waits for that one
    // rotation instead of failing, which would otherwise park sync behind its
    // 30-second retry. Afterwards the token is checked again from the top: the
    // restore may have signed out or switched scope.
    const restoreFinished = this.lifecycle.isRestoring() ? this.lifecycle.restoreFinished() : null;
    if (restoreFinished) {
      await restoreFinished.catch(() => undefined);
      return this.getAccessToken(capture, forceRefresh);
    }

    if (this.lifecycle.isRestoring()) {
      throw new AccountsApiError(
        'Relisten is restoring protected account credentials.',
        null,
        'session_restore_in_progress',
        true
      );
    }

    if (this.refreshOperation && capturesSameScope(this.refreshOperation.capture, capture)) {
      return this.refreshOperation.promise;
    }

    const promise = this.refresh(capture);
    const operation: RefreshOperation = { capture, promise };
    const clearOperation = () => {
      if (this.refreshOperation === operation) {
        this.refreshOperation = null;
      }
    };
    this.refreshOperation = operation;
    void promise.then(clearOperation, clearOperation);
    return promise;
  }

  private async refresh(capture: AccountScopeCapture): Promise<string> {
    const envelope = this.credentials.activeEnvelope();
    const epoch = this.lifecycle.currentEpoch();

    if (!capture.isAuthenticated) {
      throw new AccountsApiError(
        'The Relisten session is not available.',
        401,
        'signed_out',
        false
      );
    }

    if (!envelope) {
      throw new AccountsApiError(
        'Protected Relisten credentials are not available yet.',
        null,
        'credentials_temporarily_unavailable',
        true
      );
    }

    try {
      const credentials = await this.credentials.rotate(envelope, () => {
        this.assertCurrent(capture, epoch);
      });
      this.assertCurrent(capture, epoch);

      this.scopeStore.updateProfile(capture, credentials.profile);
      this.credentials.activate(credentials);
      this.lifecycle.profileRefreshed(credentials.profile);
      return credentials.candidate.accessToken;
    } catch (error) {
      if (
        isTerminalRefreshFailure(error) &&
        epoch === this.lifecycle.currentEpoch() &&
        this.scopeStore.isCurrent(capture)
      ) {
        await this.lifecycle.sessionExpired(envelope.nativeSessionId);
      }

      throw error;
    }
  }

  private assertCurrent(capture: AccountScopeCapture, epoch: number) {
    if (epoch !== this.lifecycle.currentEpoch() || !this.scopeStore.isCurrent(capture)) {
      throw new StaleAccountScopeError();
    }
  }
}
