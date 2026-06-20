import * as SecureStore from 'expo-secure-store';
import { MobileAccessGrantSecretStore } from '@/relisten/user_library/share_token_exchange';

const MOBILE_ACCESS_GRANT_STORAGE_OPTIONS = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
} as const;

// Mobile access grant secrets are bearer-like credentials. Realm keeps the
// playlist relationship and selector metadata; SecureStore keeps the secret.
export class SecureStoreMobileAccessGrantSecretStore implements MobileAccessGrantSecretStore {
  async getGrantSecret(storageKey: string): Promise<string | null> {
    return SecureStore.getItemAsync(storageKey, MOBILE_ACCESS_GRANT_STORAGE_OPTIONS);
  }

  async setGrantSecret(storageKey: string, secret: string): Promise<void> {
    await SecureStore.setItemAsync(storageKey, secret, MOBILE_ACCESS_GRANT_STORAGE_OPTIONS);
  }

  async clearGrantSecret(storageKey: string): Promise<void> {
    await SecureStore.deleteItemAsync(storageKey, MOBILE_ACCESS_GRANT_STORAGE_OPTIONS);
  }
}
