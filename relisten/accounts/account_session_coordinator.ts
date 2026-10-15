import Realm from 'realm';
import { log } from '@/relisten/util/logging';
import { getAccountRuntimeConfig } from './account_config';
import {
  AccountScopeCapture,
  AccountScopeSnapshot,
  AccountScopeStore,
  StaleAccountScopeError,
} from './account_scope_store';
import { AccountProfileSnapshot } from './api/account_profile';
import {
  AccountsApiError,
  AccountsApiTransport,
  AuthorizedAccountsApiClient,
} from './api/accounts_api_client';
import { AccountAuthClient } from './auth/auth_client';
import { AccountProvider } from './auth/account_auth_types';
import { clearPendingAuthTransaction } from './auth/pkce_transaction';
import { getInstallationId } from './auth/installation_id';
import { AccountTransitionEffects } from './account_transition_effects';
import { AccountError, toAccountError } from './account_errors';
import { NativeAuthFlow } from './auth/native_auth_flow';
import { UsernameService } from './username_service';
import { UsernameCommandStore } from './username_command_store';
import { AccountCredentials, ValidatedCredentials } from './account_credentials';
import { AccountAccessTokenSource } from './account_access_token_source';
import { AccountRestoreResult, AccountSessionRestorer } from './account_session_restorer';
import { AccountLogoutRequest } from './api/account_logout_request';

const logger = log.extend('account-session');
const LOGOUT_TOKEN_WAIT_MS = 1500;

type Listener = () => void;

export type AccountStatus = 'restoring' | 'signedOut' | 'signingIn' | 'signedIn' | 'error';
export type AccountSignInResult = 'signedIn' | 'cancelled';

export interface AccountSessionSnapshot {
  status: AccountStatus;
  profile: AccountProfileSnapshot | null;
  pendingUsername: string | null;
  error: AccountError | null;
  activeScope: AccountScopeSnapshot;
}

export class AccountSessionCoordinator {
  readonly scopeSource: AccountScopeStore;
  readonly accountsApi: AuthorizedAccountsApiClient;

  private readonly listeners = new Set<Listener>();
  private readonly nativeAuthFlow: NativeAuthFlow;
  private readonly credentials: AccountCredentials;
  private readonly usernameService: UsernameService;
  private readonly logoutRequest: AccountLogoutRequest;
  private readonly sessionRestorer: AccountSessionRestorer;
  private snapshot: AccountSessionSnapshot;
  private startPromise: Promise<void> | null = null;
  private restorePromise: Promise<void> | null = null;
  private signOutPromise: Promise<void> | null = null;
  private usernameRetryPromise: Promise<void> | null = null;
  private usernameUpdateInProgress = false;
  private sessionEpoch = 0;
  private transitioning = false;
  private restoringCredentials = false;
  private callbackCompletion: {
    state: string | null;
    promise: Promise<AccountSignInResult>;
  } | null = null;

  constructor(
    realm: Realm,
    private readonly transitionEffects: AccountTransitionEffects
  ) {
    const config = getAccountRuntimeConfig();
    this.scopeSource = new AccountScopeStore(realm);
    const authClient = new AccountAuthClient(config);
    const transport = new AccountsApiTransport(config.accountsOrigin);
    this.nativeAuthFlow = new NativeAuthFlow(authClient);
    this.credentials = new AccountCredentials(authClient, transport);
    this.logoutRequest = new AccountLogoutRequest(transport);
    const tokenSource = new AccountAccessTokenSource(this.credentials, this.scopeSource, {
      currentEpoch: () => this.sessionEpoch,
      isTransitioning: () => this.transitioning,
      isRestoring: () => this.restoringCredentials,
      profileRefreshed: (profile) => {
        this.publish({ status: 'signedIn', profile, error: null });
        void this.retryPendingUsername();
      },
      sessionExpired: (nativeSessionId) => this.expireSession(nativeSessionId),
    });
    this.accountsApi = new AuthorizedAccountsApiClient(transport, this.scopeSource, tokenSource);
    this.usernameService = new UsernameService(
      this.scopeSource,
      new UsernameCommandStore(realm),
      this.accountsApi
    );
    this.sessionRestorer = new AccountSessionRestorer(
      this.credentials,
      this.scopeSource,
      () => this.sessionEpoch,
      () => this.prepareToLeaveAuthenticatedScope(),
      (profile) => this.publish({ status: 'signedIn', profile, error: null })
    );
    this.snapshot = Object.freeze({
      status: 'restoring',
      profile: null,
      pendingUsername: null,
      error: null,
      activeScope: this.scopeSource.getSnapshot(),
    });
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  async start(): Promise<void> {
    if (!this.startPromise) {
      this.startPromise = this.performStart();
    }

    return this.startPromise;
  }

  private async performStart(): Promise<void> {
    this.scopeSource.start();

    getInstallationId().catch(() => {
      logger.warn('Installation identity is not available yet');
    });
    await this.restoreSession();
  }

  tearDown() {
    this.sessionEpoch += 1;
    this.credentials.clearMemory();
    this.scopeSource.tearDown();
    this.listeners.clear();
  }

  restoreSession(): Promise<void> {
    if (!this.restorePromise) {
      this.restorePromise = this.performSessionRestore().finally(() => {
        this.restorePromise = null;
      });
    }

    return this.restorePromise;
  }

  signIn = async (provider: AccountProvider): Promise<AccountSignInResult> => {
    if (this.scopeSource.getSnapshot().isAuthenticated) {
      throw new Error('Use switchAccount while another Relisten account is active.');
    }

    return this.openSignIn(provider);
  };

  switchAccount = async (provider: AccountProvider): Promise<AccountSignInResult> => {
    await this.signOut();
    return this.openSignIn(provider);
  };

  signOut = (): Promise<void> => {
    if (!this.signOutPromise) {
      if (this.transitioning) {
        throw new Error('An account transition is already in progress.');
      }

      this.signOutPromise = this.performSignOut().finally(() => {
        this.signOutPromise = null;
      });
    }

    return this.signOutPromise;
  };

  private async performSignOut(): Promise<void> {
    const activeScope = this.scopeSource.getSnapshot();
    const wasAuthenticated = activeScope.isAuthenticated;
    const previousEnvelope = this.credentials.activeEnvelope();
    const previousSessionId = activeScope.nativeSessionId ?? previousEnvelope?.nativeSessionId;

    this.transitioning = true;

    try {
      if (wasAuthenticated) {
        const accessToken = await this.accessTokenForLogout(activeScope);

        // Changing the generation first makes every request already in flight stale while
        // the player and server session are being shut down.
        this.scopeSource.invalidateInFlightWork();
        await this.prepareToLeaveAuthenticatedScope();
        await this.logoutRequest.send(accessToken);
      }
    } finally {
      try {
        this.sessionEpoch += 1;
        this.credentials.clearMemory();

        await Promise.all([this.credentials.clearPersisted(), clearPendingAuthTransaction()]).catch(
          () => {
            // The blocked native-session ID in Realm prevents a failed SecureStore deletion
            // from restoring the explicitly signed-out session on the next launch.
            logger.warn('Protected credentials could not be deleted yet');
          }
        );

        this.scopeSource.selectAnonymous(true, previousSessionId);
        this.publish({ status: 'signedOut', profile: null, error: null });
      } finally {
        this.transitioning = false;
      }
    }
  }

  private async accessTokenForLogout(capture: AccountScopeCapture): Promise<string | null> {
    const epoch = this.sessionEpoch;
    const tokenPromise = this.credentials
      .accessTokenForLogout(capture, () => {
        if (epoch !== this.sessionEpoch || !this.scopeSource.isCurrent(capture)) {
          throw new StaleAccountScopeError();
        }
      })
      .catch(() => null);

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutResult = new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), LOGOUT_TOKEN_WAIT_MS);
    });
    const accessToken = await Promise.race([tokenPromise, timeoutResult]);
    clearTimeout(timeout);

    if (!accessToken) {
      logger.info('A current access token was not available for remote logout');
    }

    return accessToken;
  }

  refreshProfile = async (): Promise<void> => {
    const capture = this.scopeSource.capture();
    const profile = await this.accountsApi.getMe();
    this.assertProfileMatchesScope(profile, capture);
    this.scopeSource.updateProfile(capture, profile);
    this.publish({ status: 'signedIn', profile, error: null });
  };

  updateUsername = async (username: string): Promise<AccountProfileSnapshot> => {
    this.usernameUpdateInProgress = true;

    try {
      const updated = await this.usernameService.update(username, this.snapshot.profile);
      this.publish({ status: 'signedIn', profile: updated, error: null });
      return updated;
    } catch (error) {
      if (error instanceof AccountsApiError && error.code === 'username_version_stale') {
        // UsernameService has already discarded the stale command. Publish before the
        // network refresh so a second failure cannot leave stale pending UI behind.
        this.publish({ error: toAccountError(error, 'username_update_failed') });
        try {
          await this.refreshProfile();
        } catch (refreshError) {
          this.publish({ error: toAccountError(refreshError, 'profile_refresh_failed') });
          throw refreshError;
        }
      } else {
        this.publish({ error: toAccountError(error, 'username_update_failed') });
      }

      throw error;
    } finally {
      this.usernameUpdateInProgress = false;
    }
  };

  retryPendingUsername = (): Promise<void> => {
    if (this.usernameUpdateInProgress) {
      return Promise.resolve();
    }

    if (!this.usernameRetryPromise) {
      this.usernameRetryPromise = this.performPendingUsernameRetry().finally(() => {
        this.usernameRetryPromise = null;
      });
    }

    return this.usernameRetryPromise;
  };

  clearError = () => {
    this.publish({
      status: this.scopeSource.getSnapshot().isAuthenticated ? 'signedIn' : 'signedOut',
      error: null,
    });
  };

  handleAuthCallback = (callbackUrl: string): Promise<AccountSignInResult> => {
    const state = new URL(callbackUrl).searchParams.get('state');

    if (this.callbackCompletion?.state === state) {
      return this.callbackCompletion.promise;
    }

    if (this.scopeSource.getSnapshot().isAuthenticated) {
      // A process can stop after the refresh token and Realm scope are committed but
      // before the callback transaction is deleted. Session restoration proves the
      // callback already succeeded, so do not exchange its one-time code again.
      const promise = clearPendingAuthTransaction()
        .catch(() => undefined)
        .then(() => 'signedIn' as const);
      this.callbackCompletion = { state, promise };
      return promise;
    }

    const promise = this.completeAuthCallback(callbackUrl);
    this.callbackCompletion = { state, promise };
    void promise.catch(() => {
      if (this.callbackCompletion?.promise === promise) {
        this.callbackCompletion = null;
      }
    });
    return promise;
  };

  private async performSessionRestore(): Promise<void> {
    const epoch = ++this.sessionEpoch;
    this.restoringCredentials = true;
    let result: AccountRestoreResult | null;

    try {
      result = await this.sessionRestorer.restore(epoch);
    } finally {
      this.restoringCredentials = false;
    }

    if (result) {
      this.publish(result);

      if (result.status === 'signedIn' && !result.error) {
        void this.retryPendingUsername();
      }
    }
  }

  private async performPendingUsernameRetry(): Promise<void> {
    const pendingUsername = this.snapshot.pendingUsername;
    const profile = this.snapshot.profile;

    if (!pendingUsername || !profile || !this.scopeSource.getSnapshot().isAuthenticated) {
      return;
    }

    try {
      const updated = await this.usernameService.update(pendingUsername, profile);
      this.publish({ status: 'signedIn', profile: updated, error: null });
    } catch (error) {
      if (error instanceof StaleAccountScopeError) {
        return;
      }

      if (error instanceof AccountsApiError && error.code === 'username_version_stale') {
        this.publish({});
        await this.refreshProfile().catch(() => undefined);
        return;
      }

      if (!(error instanceof AccountsApiError) || !error.retryable) {
        this.publish({ error: toAccountError(error, 'username_update_failed') });
      }
    }
  }

  private async openSignIn(provider: AccountProvider): Promise<AccountSignInResult> {
    if (this.transitioning) {
      throw new Error('An account transition is already in progress.');
    }

    this.transitioning = true;
    this.sessionEpoch += 1;
    this.publish({ status: 'signingIn', profile: null, error: null });
    let callbackStarted = false;

    try {
      const result = await this.nativeAuthFlow.open(provider);

      if (result.type === 'cancelled') {
        this.publish({ status: 'signedOut', profile: null, error: null });
        return 'cancelled';
      }

      callbackStarted = true;
      return await this.handleAuthCallback(result.callbackUrl);
    } catch (error) {
      if (!callbackStarted) {
        this.publish({
          status: 'error',
          profile: null,
          error: toAccountError(error, 'sign_in_failed'),
        });
      }

      throw error;
    } finally {
      this.transitioning = false;
    }
  }

  private async completeAuthCallback(callbackUrl: string): Promise<AccountSignInResult> {
    const epoch = ++this.sessionEpoch;
    this.transitioning = true;
    this.publish({ status: 'signingIn', profile: null, error: null });

    try {
      const candidate = await this.nativeAuthFlow.exchangeCallback(callbackUrl);

      if (candidate === 'cancelled') {
        this.publish({ status: 'signedOut', profile: null, error: null });
        return 'cancelled';
      }

      let credentials: ValidatedCredentials;

      try {
        credentials = await this.credentials.validate(candidate, candidate.subject);
      } catch (error) {
        // The authorization code is already consumed and the candidate token exists only
        // in memory. Whether validation was rejected or merely lost its connection, this
        // callback cannot be replayed safely; the user must begin a fresh sign-in.
        await clearPendingAuthTransaction().catch(() => undefined);
        throw error;
      }

      if (epoch !== this.sessionEpoch) {
        await clearPendingAuthTransaction().catch(() => undefined);
        throw new StaleAccountScopeError();
      }

      await this.promoteCandidate(credentials, epoch);
      return 'signedIn';
    } catch (error) {
      if (error instanceof StaleAccountScopeError) {
        await clearPendingAuthTransaction().catch(() => undefined);
        throw error;
      }

      this.publish({
        status: 'error',
        profile: null,
        error: toAccountError(error, 'sign_in_callback_failed'),
      });
      throw error;
    } finally {
      this.transitioning = false;
    }
  }

  private async promoteCandidate(credentials: ValidatedCredentials, epoch: number) {
    await this.credentials.persist(credentials);

    if (epoch !== this.sessionEpoch) {
      throw new StaleAccountScopeError();
    }

    await clearPendingAuthTransaction().catch(() => {
      // The authenticated session is already durable. A stale callback transaction is
      // harmless and expires quickly; do not turn a completed sign-in into an error.
      logger.warn('Completed sign-in transaction could not be deleted yet');
    });

    if (epoch !== this.sessionEpoch) {
      throw new StaleAccountScopeError();
    }

    // AccountScopeStore notifies consumers synchronously. Make the access token usable
    // and close the transition gate before publishing the scope so the first favorites
    // pull cannot mistake a newly signed-in account for stale transition work.
    this.credentials.activate(credentials);
    this.transitioning = false;
    this.scopeSource.promote(credentials.profile);
    this.publish({ status: 'signedIn', profile: credentials.profile, error: null });
  }

  private async expireSession(nativeSessionId: string) {
    this.transitioning = true;

    try {
      this.sessionEpoch += 1;
      this.credentials.clearMemory();
      this.scopeSource.invalidateInFlightWork();
      await this.prepareToLeaveAuthenticatedScope();
      this.scopeSource.selectAnonymous(true, nativeSessionId);
      await this.credentials.clearPersisted().catch(() => undefined);
      this.publish({
        status: 'error',
        profile: null,
        error: {
          code: 'session_expired',
          message: 'Sign in again to continue syncing your Relisten account.',
          retryable: false,
        },
      });
    } finally {
      this.transitioning = false;
    }
  }

  private assertProfileMatchesScope(profile: AccountProfileSnapshot, capture: AccountScopeCapture) {
    if (
      !capture.isAuthenticated ||
      profile.userUuid !== capture.userUuid ||
      profile.nativeSessionId !== capture.nativeSessionId ||
      !this.scopeSource.isCurrent(capture)
    ) {
      throw new StaleAccountScopeError();
    }
  }

  private async prepareToLeaveAuthenticatedScope() {
    try {
      await this.transitionEffects.beforeLeavingAuthenticatedScope();
    } catch {
      logger.warn('Account transition cleanup did not complete cleanly');
    }
  }

  private publish(
    update: Partial<Omit<AccountSessionSnapshot, 'activeScope' | 'pendingUsername'>>
  ) {
    const activeScope = this.scopeSource.getSnapshot();
    this.snapshot = Object.freeze({
      ...this.snapshot,
      ...update,
      pendingUsername: activeScope.isAuthenticated
        ? this.usernameService.pendingUsername(activeScope.scopeId)
        : null,
      activeScope,
    });

    for (const listener of this.listeners) {
      listener();
    }
  }
}
