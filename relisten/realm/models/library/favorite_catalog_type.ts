export const FAVORITE_CATALOG_TYPES = [
  'artist',
  'show',
  'source',
  'source_track',
  'song',
  'tour',
  'venue',
] as const;

export type FavoriteCatalogType = (typeof FAVORITE_CATALOG_TYPES)[number];

export function isFavoriteCatalogType(value: string): value is FavoriteCatalogType {
  return FAVORITE_CATALOG_TYPES.includes(value as FavoriteCatalogType);
}
