import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({ getRandomValues: (value: Uint8Array) => value }));
import {
  catalogReferenceForFavoriteTarget,
  favoriteTargetForCatalogReference,
  favoriteTargetForCatalogUuid,
  isFavoriteTarget,
} from './favorite_catalog_target';

const catalogUuid = '8bf22e27-11de-96e8-4653-964ff9faae2d';

describe('favorite catalog target boundary', () => {
  it.each([
    ['artist', 'artist'],
    ['show', 'show'],
    ['source', 'source'],
    ['track', 'source_track'],
    ['imported_song', 'song'],
    ['imported_venue', 'venue'],
    ['tour', 'tour'],
  ] as const)('losslessly maps %s targets to the v3 %s UUID boundary', (kind, catalogType) => {
    const target = favoriteTargetForCatalogUuid(kind, catalogUuid);

    expect(catalogReferenceForFavoriteTarget(target)).toEqual({
      catalog_type: catalogType,
      catalog_uuid: catalogUuid,
    });
    expect(
      favoriteTargetForCatalogReference({ catalog_type: catalogType, catalog_uuid: catalogUuid })
    ).toEqual(target);
  });

  it('retains normalized targets without trying to decode them as catalog UUIDs', () => {
    const song = { kind: 'song' as const, id: 'song_62mhvjyd' };
    const venue = { kind: 'venue' as const, id: 'venue_fp4h900f' };

    expect(isFavoriteTarget(song)).toBe(true);
    expect(isFavoriteTarget(venue)).toBe(true);
    expect(catalogReferenceForFavoriteTarget(song)).toBeNull();
    expect(catalogReferenceForFavoriteTarget(venue)).toBeNull();
  });

  it('rejects a raw UUID and a typed ID with the wrong target kind', () => {
    const artist = favoriteTargetForCatalogUuid('artist', catalogUuid);

    expect(isFavoriteTarget({ kind: 'artist', id: catalogUuid })).toBe(false);
    expect(isFavoriteTarget({ kind: 'show', id: artist.id })).toBe(false);
  });
});
