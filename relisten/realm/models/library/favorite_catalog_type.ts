export const FAVORITE_TARGET_KINDS = [
  'artist',
  'show',
  'source',
  'track',
  'imported_song',
  'imported_venue',
  'song',
  'tour',
  'venue',
] as const;

export type FavoriteTargetKind = (typeof FAVORITE_TARGET_KINDS)[number];

export function isFavoriteTargetKind(value: string): value is FavoriteTargetKind {
  return FAVORITE_TARGET_KINDS.includes(value as FavoriteTargetKind);
}
