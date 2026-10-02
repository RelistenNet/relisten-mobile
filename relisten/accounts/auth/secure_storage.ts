import * as SecureStore from 'expo-secure-store';

export type SecureValueResult<T> =
  | { state: 'available'; value: T }
  | { state: 'missing' }
  | { state: 'temporarilyUnavailable' };

export class SecureStorageTemporarilyUnavailableError extends Error {
  constructor() {
    super('Protected account storage is temporarily unavailable.');
    this.name = 'SecureStorageTemporarilyUnavailableError';
  }
}

export class InvalidSecureValueError extends Error {
  constructor(readonly storageKey: string) {
    super(`Protected value ${storageKey} is invalid.`);
    this.name = 'InvalidSecureValueError';
  }
}

export const ACCOUNT_SECURE_STORE_OPTIONS = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
} as const;

function isTemporarilyUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const messages = [error.message];

  if (error.cause instanceof Error) {
    messages.push(error.cause.message);
  }

  return messages.some((message) =>
    /interaction is not allowed|errSecInteractionNotAllowed|keychain.*unavailable/i.test(message)
  );
}

export async function readSecureJson<T>(storageKey: string): Promise<SecureValueResult<T>> {
  let serialized: string | null;

  try {
    serialized = await SecureStore.getItemAsync(storageKey, ACCOUNT_SECURE_STORE_OPTIONS);
  } catch (error) {
    if (isTemporarilyUnavailable(error)) {
      return { state: 'temporarilyUnavailable' };
    }

    throw error;
  }

  if (serialized === null) {
    return { state: 'missing' };
  }

  try {
    return { state: 'available', value: JSON.parse(serialized) as T };
  } catch {
    throw new InvalidSecureValueError(storageKey);
  }
}

export async function writeSecureJson(storageKey: string, value: unknown): Promise<void> {
  try {
    await SecureStore.setItemAsync(storageKey, JSON.stringify(value), ACCOUNT_SECURE_STORE_OPTIONS);
  } catch (error) {
    if (isTemporarilyUnavailable(error)) {
      throw new SecureStorageTemporarilyUnavailableError();
    }

    throw error;
  }
}

export function deleteSecureValue(storageKey: string): Promise<void> {
  return SecureStore.deleteItemAsync(storageKey, ACCOUNT_SECURE_STORE_OPTIONS);
}
