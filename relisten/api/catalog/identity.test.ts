import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));
import {
  decodeUuidCatalogId,
  encodeUuidCatalogId,
  InvalidCatalogIdError,
  retainShortCatalogId,
} from './identity';
import type { UuidCatalogPrefix } from './resources';

const uuid = '769b65e5-5d53-4710-8ae3-e6d3d63f576f';
const uuidPrefixes: UuidCatalogPrefix[] = [
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

describe('catalog identity adapter', () => {
  it.each(uuidPrefixes)('losslessly converts %s IDs at the adapter', (prefix) => {
    const wireId = encodeUuidCatalogId(uuid, prefix);

    expect(decodeUuidCatalogId(wireId, prefix)).toBe(uuid);
  });

  it('rejects a UUID-backed ID with the wrong resource prefix', () => {
    const trackId = encodeUuidCatalogId(uuid, 'track');

    expect(() => decodeUuidCatalogId(trackId, 'source')).toThrow(InvalidCatalogIdError);
  });

  it.each(['TRACK_3s1y1rg4yaxa7nqw31wk617b0d', 'track_8s1y1rg4yaxa7nqw31wk617b0d'])(
    'rejects a malformed UUID-backed ID: %s',
    (value) => {
      expect(() => decodeUuidCatalogId(value, 'track')).toThrow(InvalidCatalogIdError);
    }
  );

  it.each([
    ['venue_fp4h900f', 'venue'],
    ['song_5scc3zaz', 'song'],
    ['artist_venue_344wrm28', 'artist_venue'],
  ] as const)('retains the short %s identity as a string', (value, prefix) => {
    expect(retainShortCatalogId(value, prefix)).toBe(value);
  });

  it.each([
    ['venue_fp4h900', 'venue'],
    ['song_5SCC3ZAZ', 'song'],
    ['artist_venue_344wrm2i', 'artist_venue'],
    ['song_344wrm28', 'venue'],
  ] as const)('rejects malformed short identity %s', (value, prefix) => {
    expect(() => retainShortCatalogId(value, prefix)).toThrow(InvalidCatalogIdError);
  });
});
