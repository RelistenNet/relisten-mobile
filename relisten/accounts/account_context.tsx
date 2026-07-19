import Realm from 'realm';
import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  AccountSessionCoordinator,
  AccountSignInResult,
  AccountStatus,
} from './account_session_coordinator';
import { AccountError } from './account_errors';
import {
  AccountScopeCapture,
  AccountScopeSnapshot,
  AccountScopeSource,
  StaleAccountScopeError,
} from './account_scope_store';
import { AccountProfileSnapshot } from './api/account_profile';
import { AuthorizedAccountsApiClient } from './api/accounts_api_client';
import { AccountProvider as IdentityProvider } from './auth/account_auth_types';
import { AccountTransitionEffects } from './account_transition_effects';

export type AccountProvider = IdentityProvider;
export type { AccountScopeCapture, AccountScopeSnapshot, AccountScopeSource };
export { StaleAccountScopeError };

export interface AccountContextValue {
  status: AccountStatus;
  profile: AccountProfileSnapshot | null;
  pendingUsername: string | null;
  error: AccountError | null;
  activeScope: AccountScopeSnapshot;
  signIn(provider: AccountProvider): Promise<AccountSignInResult>;
  signOut(): Promise<void>;
  switchAccount(provider: AccountProvider): Promise<AccountSignInResult>;
  refreshProfile(): Promise<void>;
  updateUsername(username: string): Promise<AccountProfileSnapshot>;
  clearError(): void;
}

export interface AccountAccess {
  accountsApi: AuthorizedAccountsApiClient;
  scopeSource: AccountScopeSource;
}

interface InternalAccountContextValue extends AccountContextValue {
  coordinator: AccountSessionCoordinator;
}

const AccountContext = createContext<InternalAccountContextValue | undefined>(undefined);

export function AccountProvider({
  realm,
  transitionEffects,
  children,
}: PropsWithChildren<{ realm: Realm; transitionEffects: AccountTransitionEffects }>) {
  const coordinator = useMemo(
    () => new AccountSessionCoordinator(realm, transitionEffects),
    [realm, transitionEffects]
  );
  const snapshot = useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getSnapshot,
    coordinator.getSnapshot
  );

  useEffect(() => {
    coordinator.start();

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      const errorCode = coordinator.getSnapshot().error?.code;

      if (
        state === 'active' &&
        (errorCode === 'credentials_temporarily_unavailable' ||
          errorCode === 'session_restore_failed')
      ) {
        void coordinator.restoreSession();
      } else if (state === 'active') {
        void coordinator.retryPendingUsername();
      }
    });
    const networkSubscription = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        void coordinator.retryPendingUsername();
      }
    });

    return () => {
      appStateSubscription.remove();
      networkSubscription();

      // React Strict Mode performs a synthetic unmount/remount in development.
      // Tearing down here would rotate a valid refresh token twice during launch.
      if (!__DEV__) {
        coordinator.tearDown();
      }
    };
  }, [coordinator]);

  const value = useMemo<InternalAccountContextValue>(
    () => ({
      ...snapshot,
      coordinator,
      signIn: coordinator.signIn,
      signOut: coordinator.signOut,
      switchAccount: coordinator.switchAccount,
      refreshProfile: coordinator.refreshProfile,
      updateUsername: coordinator.updateUsername,
      clearError: coordinator.clearError,
    }),
    [coordinator, snapshot]
  );

  if (snapshot.status === 'restoring') {
    return null;
  }

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

function useInternalAccountContext() {
  const context = useContext(AccountContext);

  if (!context) {
    throw new Error('AccountProvider is required');
  }

  return context;
}

export function useAccount(): AccountContextValue {
  return useInternalAccountContext();
}

export function useAccountScope(): AccountScopeSnapshot {
  const source = useInternalAccountContext().coordinator.scopeSource;
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
}

export function useAccountScopeSource(): AccountScopeSource {
  return useInternalAccountContext().coordinator.scopeSource;
}

export function useAccountsApiClient(): AuthorizedAccountsApiClient {
  return useInternalAccountContext().coordinator.accountsApi;
}

export function useAccountAccess(): AccountAccess {
  const coordinator = useInternalAccountContext().coordinator;

  return useMemo(
    () => ({
      accountsApi: coordinator.accountsApi,
      scopeSource: coordinator.scopeSource,
    }),
    [coordinator]
  );
}

export function useAccountCallbackHandler() {
  return useInternalAccountContext().coordinator.handleAuthCallback;
}
