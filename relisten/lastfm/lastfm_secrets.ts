import * as SecureStore from 'expo-secure-store';

const SESSION_KEY_STORAGE_KEY = 'lastfm_session_key';

export const LastFmSecrets = {
  async getSessionKey(): Promise<string | null> {
    return SecureStore.getItemAsync(SESSION_KEY_STORAGE_KEY);
  },
  async setSessionKey(sessionKey: string): Promise<void> {
    await SecureStore.setItemAsync(SESSION_KEY_STORAGE_KEY, sessionKey);
  },
  async clearSessionKey(): Promise<void> {
    await SecureStore.deleteItemAsync(SESSION_KEY_STORAGE_KEY);
  },
};
