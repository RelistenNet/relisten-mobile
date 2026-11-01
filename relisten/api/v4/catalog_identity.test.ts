import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));
import {
  decodeV4UuidCatalogId,
  encodeV4UuidCatalogId,
  InvalidV4CatalogIdError,
  retainV4ShortCatalogId,
} from './catalog_identity';
import type { V4UuidCatalogPrefix } from './wire_types';

const uuid = '769b65e5-5d53-4710-8ae3-e6d3d63f576f';
const uuidPrefixes: V4UuidCatalogPrefix[] = [
  'artist',
  'year',
  'show',
  'tour',
  'imported_venue',
  'imported_song',
  'source',
  'source_set',
  'track',
];

describe('v4 catalog identity adapter', () => {
  it.each(uuidPrefixes)('losslessly converts %s IDs at the adapter', (prefix) => {
    const wireId = encodeV4UuidCatalogId(uuid, prefix);

    expect(decodeV4UuidCatalogId(wireId, prefix)).toBe(uuid);
  });

  it('rejects a UUID-backed ID with the wrong resource prefix', () => {
    const trackId = encodeV4UuidCatalogId(uuid, 'track');

    expect(() => decodeV4UuidCatalogId(trackId, 'source')).toThrow(InvalidV4CatalogIdError);
  });

  it.each(['TRACK_3s1y1rg4yaxa7nqw31wk617b0d', 'track_8s1y1rg4yaxa7nqw31wk617b0d'])(
    'rejects a malformed UUID-backed ID: %s',
    (value) => {
      expect(() => decodeV4UuidCatalogId(value, 'track')).toThrow(InvalidV4CatalogIdError);
    }
  );

  it.each([
    ['venue_fp4h900f', 'venue'],
    ['song_5scc3zaz', 'song'],
    ['artist_venue_344wrm28', 'artist_venue'],
  ] as const)('retains the short %s identity as a string', (value, prefix) => {
    expect(retainV4ShortCatalogId(value, prefix)).toBe(value);
  });

  it.each([
    ['venue_fp4h900', 'venue'],
    ['song_5SCC3ZAZ', 'song'],
    ['artist_venue_344wrm2i', 'artist_venue'],
    ['song_344wrm28', 'venue'],
  ] as const)('rejects malformed short identity %s', (value, prefix) => {
    expect(() => retainV4ShortCatalogId(value, prefix)).toThrow(InvalidV4CatalogIdError);
  });
});
