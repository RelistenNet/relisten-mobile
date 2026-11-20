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
  // A listener's own playlist, by its playlist_ typed ID. Not a catalog item.
  'playlist',
] as const;

export type FavoriteTargetKind = (typeof FAVORITE_TARGET_KINDS)[number];

export function isFavoriteTargetKind(value: string): value is FavoriteTargetKind {
  return FAVORITE_TARGET_KINDS.includes(value as FavoriteTargetKind);
}
