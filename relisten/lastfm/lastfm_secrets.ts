import * as SecureStore from 'expo-secure-store';
import { log } from '@/relisten/util/logging';

const logger = log.extend('lastfm-secrets');
const LEGACY_SESSION_KEY_STORAGE_KEY = 'lastfm_session_key';
const SESSION_KEY_STORAGE_KEY = 'lastfm_session_key_v2';
const SESSION_KEY_STORAGE_OPTIONS = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
} as const;

let cachedSessionKey: string | null | undefined;
let sessionKeyLoadPromise: Promise<string | null> | undefined;

const USER_INTERACTION_NOT_ALLOWED_MESSAGE = 'User interaction is not allowed';

function isUserInteractionNotAllowedError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes(USER_INTERACTION_NOT_ALLOWED_MESSAGE) ||
      (error.cause instanceof Error &&
        error.cause.message.includes(USER_INTERACTION_NOT_ALLOWED_MESSAGE)))
  );
}

async function readSessionKey(storageKey: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(storageKey, SESSION_KEY_STORAGE_OPTIONS);
  } catch (error) {
    if (isUserInteractionNotAllowedError(error)) {
      logger.info(`Session key unavailable while device is locked for key=${storageKey}`);
      return null;
    }

    throw error;
  }
}

async function loadSessionKey(): Promise<string | null> {
  const sessionKey = await readSessionKey(SESSION_KEY_STORAGE_KEY);

  if (sessionKey) {
    return sessionKey;
  }

  const legacySessionKey = await readSessionKey(LEGACY_SESSION_KEY_STORAGE_KEY);

  if (!legacySessionKey) {
    return null;
  }

  await SecureStore.setItemAsync(
    SESSION_KEY_STORAGE_KEY,
    legacySessionKey,
    SESSION_KEY_STORAGE_OPTIONS
  );

  return legacySessionKey;
}

export const LastFmSecrets = {
  async getSessionKey(): Promise<string | null> {
    if (cachedSessionKey !== undefined) {
      return cachedSessionKey;
    }

    if (!sessionKeyLoadPromise) {
      sessionKeyLoadPromise = loadSessionKey().finally(() => {
        sessionKeyLoadPromise = undefined;
      });
    }

    cachedSessionKey = await sessionKeyLoadPromise;
    return cachedSessionKey;
  },
  async setSessionKey(sessionKey: string): Promise<void> {
    sessionKeyLoadPromise = undefined;
    cachedSessionKey = sessionKey;
    await SecureStore.setItemAsync(
      SESSION_KEY_STORAGE_KEY,
      sessionKey,
      SESSION_KEY_STORAGE_OPTIONS
    );
  },
  async clearSessionKey(): Promise<void> {
    sessionKeyLoadPromise = undefined;
    cachedSessionKey = null;
    await Promise.all([
      SecureStore.deleteItemAsync(SESSION_KEY_STORAGE_KEY, SESSION_KEY_STORAGE_OPTIONS),
      SecureStore.deleteItemAsync(LEGACY_SESSION_KEY_STORAGE_KEY, SESSION_KEY_STORAGE_OPTIONS),
    ]);
  },
};
