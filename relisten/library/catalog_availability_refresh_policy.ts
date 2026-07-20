/**
 * Successful catalog answers are reused across routine foreground syncs. A
 * day is short enough to discover removals and restorations without sending a
 * user's entire active library to the resolver every time the app wakes.
 */
export const CATALOG_AVAILABILITY_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type FavoriteMetadataHydrationState = {
  availabilityCheckedAt?: Date;
  effectivePresent: boolean;
  hasLocalMetadata: boolean;
  metadataStatus: 'unknown' | 'available' | 'unavailable';
};

export function favoritePresenceChangeNeedsHydration(
  wasPresent: boolean,
  isPresent: boolean,
  metadataStatus: FavoriteMetadataHydrationState['metadataStatus']
) {
  return !wasPresent && isPresent && metadataStatus === 'unavailable';
}

/** Missing answers are due immediately; persisted answers expire on a fixed cadence. */
export function catalogAvailabilityNeedsRefresh(checkedAt: Date | undefined, now: Date) {
  return (
    !checkedAt || now.getTime() - checkedAt.getTime() >= CATALOG_AVAILABILITY_REFRESH_INTERVAL_MS
  );
}

export function favoriteMetadataNeedsHydration(
  favorite: FavoriteMetadataHydrationState,
  now: Date
) {
  if (!favorite.effectivePresent) {
    return false;
  }
  if (favorite.metadataStatus === 'unknown') {
    return true;
  }
  if (!favorite.hasLocalMetadata && favorite.metadataStatus === 'available') {
    return true;
  }
  return catalogAvailabilityNeedsRefresh(favorite.availabilityCheckedAt, now);
}

export function filterActiveFavoriteReferences<T>(
  references: ReadonlyArray<T>,
  isActiveFavorite: (reference: T) => boolean
) {
  return references.filter(isActiveFavorite);
}
