import Realm from 'realm';
import { RelistenUserLibraryApiClient } from '@/relisten/api/user_library_client';
import {
  UserLibraryAuthSessionService,
  UserLibraryRefreshTokenStore,
} from '@/relisten/user_library/auth_session';
import { SecureStoreUserLibraryRefreshTokenStore } from '@/relisten/user_library/auth_token_store';
import { SecureStoreMobileAccessGrantSecretStore } from '@/relisten/user_library/mobile_access_grant_secret_store';
import { MobileAccessGrantSecretStore } from '@/relisten/user_library/share_token_exchange';
import { UserLibrarySyncRunner } from '@/relisten/user_library/user_library_sync_runner';

export interface UserLibrarySyncServices {
  authClient: RelistenUserLibraryApiClient;
  client: RelistenUserLibraryApiClient;
  authSession: UserLibraryAuthSessionService;
  mobileAccessGrantSecretStore: MobileAccessGrantSecretStore;
  runner: UserLibrarySyncRunner;
}

export interface CreateUserLibrarySyncServicesOptions {
  authClient?: RelistenUserLibraryApiClient;
  client?: RelistenUserLibraryApiClient;
  refreshTokenStore?: UserLibraryRefreshTokenStore;
  mobileAccessGrantSecretStore?: MobileAccessGrantSecretStore;
}

// Lightweight composition root for user-library services. The auth client is
// separate from the general client so refresh/sign-in flows can be overridden or
// tested independently from ordinary library reads/mutations.
export function createUserLibrarySyncServices(
  realm: Realm,
  options: CreateUserLibrarySyncServicesOptions = {}
): UserLibrarySyncServices {
  const authClient = options.authClient ?? new RelistenUserLibraryApiClient();
  const client = options.client ?? new RelistenUserLibraryApiClient();
  const refreshTokenStore =
    options.refreshTokenStore ?? new SecureStoreUserLibraryRefreshTokenStore();
  const mobileAccessGrantSecretStore =
    options.mobileAccessGrantSecretStore ?? new SecureStoreMobileAccessGrantSecretStore();
  const authSession = new UserLibraryAuthSessionService(authClient, refreshTokenStore);

  return {
    authClient,
    client,
    authSession,
    mobileAccessGrantSecretStore,
    runner: new UserLibrarySyncRunner(realm, client, authSession),
  };
}
