import { formatUuidTypedId, parseUuidTypedId } from '@/relisten/util/typed_uuid_id';
import type {
  ShortCatalogId,
  ShortCatalogPrefix,
  UuidCatalogId,
  UuidCatalogPrefix,
} from './resources';

const SHORT_ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

export class InvalidCatalogIdError extends Error {
  constructor(value: unknown, expectedPrefix: string) {
    super(`Expected a valid ${expectedPrefix}_ catalog ID, received ${String(value)}.`);
    this.name = 'InvalidCatalogIdError';
  }
}

/** Converts a UUID-backed catalog ID to the existing raw UUID Realm key. */
export function decodeUuidCatalogId<TPrefix extends UuidCatalogPrefix>(
  value: unknown,
  expectedPrefix: TPrefix
): string {
  const uuid = parseUuidTypedId(value, expectedPrefix);
  if (!uuid) {
    throw new InvalidCatalogIdError(value, expectedPrefix);
  }

  return uuid;
}

/** Converts an existing raw UUID Realm key to the corresponding catalog wire ID. */
export function encodeUuidCatalogId<TPrefix extends UuidCatalogPrefix>(
  uuid: string,
  prefix: TPrefix
): UuidCatalogId<TPrefix> {
  return formatUuidTypedId(prefix, uuid) as UuidCatalogId<TPrefix>;
}

/** Validates a short normalization ID without converting it to another identity. */
export function retainShortCatalogId<TPrefix extends ShortCatalogPrefix>(
  value: unknown,
  expectedPrefix: TPrefix
): ShortCatalogId<TPrefix> {
  const marker = `${expectedPrefix}_`;
  if (
    typeof value !== 'string' ||
    value.length !== marker.length + 8 ||
    !value.startsWith(marker) ||
    [...value.slice(marker.length)].some((character) => !SHORT_ID_ALPHABET.includes(character))
  ) {
    throw new InvalidCatalogIdError(value, expectedPrefix);
  }

  return value as ShortCatalogId<TPrefix>;
}
