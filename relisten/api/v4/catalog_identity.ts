import { formatUuidTypedId, parseUuidTypedId } from '@/relisten/util/typed_uuid_id';
import type {
  V4ShortCatalogId,
  V4ShortCatalogPrefix,
  V4UuidCatalogId,
  V4UuidCatalogPrefix,
} from './wire_types';

const SHORT_ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

export class InvalidV4CatalogIdError extends Error {
  constructor(value: unknown, expectedPrefix: string) {
    super(`Expected a valid ${expectedPrefix}_ catalog ID, received ${String(value)}.`);
    this.name = 'InvalidV4CatalogIdError';
  }
}

/** Converts a UUID-backed v4 ID to the existing raw UUID Realm key. */
export function decodeV4UuidCatalogId<TPrefix extends V4UuidCatalogPrefix>(
  value: unknown,
  expectedPrefix: TPrefix
): string {
  const uuid = parseUuidTypedId(value, expectedPrefix);
  if (!uuid) {
    throw new InvalidV4CatalogIdError(value, expectedPrefix);
  }

  return uuid;
}

/** Converts an existing raw UUID Realm key to the corresponding v4 wire ID. */
export function encodeV4UuidCatalogId<TPrefix extends V4UuidCatalogPrefix>(
  uuid: string,
  prefix: TPrefix
): V4UuidCatalogId<TPrefix> {
  return formatUuidTypedId(prefix, uuid) as V4UuidCatalogId<TPrefix>;
}

/** Validates a short normalization ID without converting it to another identity. */
export function retainV4ShortCatalogId<TPrefix extends V4ShortCatalogPrefix>(
  value: unknown,
  expectedPrefix: TPrefix
): V4ShortCatalogId<TPrefix> {
  const marker = `${expectedPrefix}_`;
  if (
    typeof value !== 'string' ||
    value.length !== marker.length + 8 ||
    !value.startsWith(marker) ||
    [...value.slice(marker.length)].some((character) => !SHORT_ID_ALPHABET.includes(character))
  ) {
    throw new InvalidV4CatalogIdError(value, expectedPrefix);
  }

  return value as V4ShortCatalogId<TPrefix>;
}
