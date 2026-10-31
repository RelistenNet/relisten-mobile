import { createUuidV7, isUuidV7 } from './uuid_v7';

const CROCKFORD_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Losslessly encodes a UUID with the lowercase U26 representation used by Relisten typed IDs. */
export function formatUuidTypedId(prefix: string, uuid: string): string {
  if (!UUID_PATTERN.test(uuid)) {
    throw new Error('Expected a canonical UUID.');
  }

  let value = BigInt(`0x${uuid.replaceAll('-', '')}`);
  const suffix = Array<string>(26);

  for (let index = suffix.length - 1; index >= 0; index -= 1) {
    suffix[index] = CROCKFORD_ALPHABET[Number(value & 31n)];
    value >>= 5n;
  }

  return `${prefix}_${suffix.join('')}`;
}

export function parseUuidTypedId(value: unknown, expectedPrefix: string): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const marker = `${expectedPrefix}_`;
  if (value.length !== marker.length + 26 || !value.startsWith(marker)) {
    return null;
  }

  const suffix = value.slice(marker.length);
  if (suffix[0] < '0' || suffix[0] > '7') {
    return null;
  }

  let decoded = 0n;
  for (const character of suffix) {
    const digit = CROCKFORD_ALPHABET.indexOf(character);
    if (digit < 0) {
      return null;
    }
    decoded = (decoded << 5n) | BigInt(digit);
  }

  const hex = decoded.toString(16).padStart(32, '0');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export function isUuidV7TypedId(value: unknown, expectedPrefix: string): value is string {
  const uuid = parseUuidTypedId(value, expectedPrefix);
  return uuid !== null && isUuidV7(uuid);
}

export function createUuidV7TypedId(prefix: string): string {
  return formatUuidTypedId(prefix, createUuidV7());
}
