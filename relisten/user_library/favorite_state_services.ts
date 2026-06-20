import Realm from 'realm';
import { RelistenUserLibraryApiClient } from '@/relisten/api/user_library_client';
import { SecureStoreUserLibraryRefreshTokenStore } from '@/relisten/user_library/auth_token_store';
import { UserLibraryAuthSessionService } from '@/relisten/user_library/auth_session';
import { UserLibraryFavoriteMutationService } from '@/relisten/user_library/favorite_state';

const favoriteMutationServicesByRealm = new WeakMap<Realm, UserLibraryFavoriteMutationService>();

export function getSharedUserLibraryFavoriteMutationService(
  realm: Realm
): UserLibraryFavoriteMutationService {
  const existing = favoriteMutationServicesByRealm.get(realm);

  if (existing) {
    return existing;
  }

  const client = new RelistenUserLibraryApiClient();
  const authClient = new RelistenUserLibraryApiClient();
  const refreshTokenStore = new SecureStoreUserLibraryRefreshTokenStore();
  const authSession = new UserLibraryAuthSessionService(authClient, refreshTokenStore);
  const service = new UserLibraryFavoriteMutationService(realm, client, authSession);

  favoriteMutationServicesByRealm.set(realm, service);
  return service;
}
