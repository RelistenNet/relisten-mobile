import * as SecureStore from 'expo-secure-store';
import { UserLibraryRefreshTokenStore } from '@/relisten/user_library/auth_session';

const REFRESH_TOKEN_STORAGE_KEY = 'relisten_user_library_refresh_token_v1';
const REFRESH_TOKEN_STORAGE_OPTIONS = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
} as const;

export class SecureStoreUserLibraryRefreshTokenStore implements UserLibraryRefreshTokenStore {
  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_TOKEN_STORAGE_KEY, REFRESH_TOKEN_STORAGE_OPTIONS);
  }

  async setRefreshToken(refreshToken: string): Promise<void> {
    await SecureStore.setItemAsync(
      REFRESH_TOKEN_STORAGE_KEY,
      refreshToken,
      REFRESH_TOKEN_STORAGE_OPTIONS
    );
  }

  async clearRefreshToken(): Promise<void> {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY, REFRESH_TOKEN_STORAGE_OPTIONS);
  }
}
