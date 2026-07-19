import { getRandomValues } from 'expo-crypto';
import { v7 } from 'uuid';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createUuidV7(): string {
  // `uuid` falls back to the Web Crypto global, which React Native does not
  // guarantee. Supplying Expo's native CSPRNG keeps every call runtime-safe on
  // iOS and Android. Ordering is carried by explicit localSequence fields.
  return v7({ random: getRandomValues(new Uint8Array(16)) });
}

export function isUuidV7(value: unknown): value is string {
  return typeof value === 'string' && UUID_V7_PATTERN.test(value);
}
