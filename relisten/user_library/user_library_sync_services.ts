import Realm from 'realm';
import { RelistenUserLibraryApiClient } from '@/relisten/api/user_library_client';
import {
  UserLibraryAuthSessionService,
  UserLibraryRefreshTokenStore,
} from '@/relisten/user_library/auth_session';
import { SecureStoreUserLibraryRefreshTokenStore } from '@/relisten/user_library/auth_token_store';
import { UserLibrarySyncRunner } from '@/relisten/user_library/user_library_sync_runner';

export interface UserLibrarySyncServices {
  authClient: RelistenUserLibraryApiClient;
  client: RelistenUserLibraryApiClient;
  authSession: UserLibraryAuthSessionService;
  runner: UserLibrarySyncRunner;
}

export interface CreateUserLibrarySyncServicesOptions {
  authClient?: RelistenUserLibraryApiClient;
  client?: RelistenUserLibraryApiClient;
  refreshTokenStore?: UserLibraryRefreshTokenStore;
}

export function createUserLibrarySyncServices(
  realm: Realm,
  options: CreateUserLibrarySyncServicesOptions = {}
): UserLibrarySyncServices {
  const authClient = options.authClient ?? new RelistenUserLibraryApiClient();
  const client = options.client ?? new RelistenUserLibraryApiClient();
  const refreshTokenStore =
    options.refreshTokenStore ?? new SecureStoreUserLibraryRefreshTokenStore();
  const authSession = new UserLibraryAuthSessionService(authClient, refreshTokenStore);

  return {
    authClient,
    client,
    authSession,
    runner: new UserLibrarySyncRunner(realm, client, authSession),
  };
}
