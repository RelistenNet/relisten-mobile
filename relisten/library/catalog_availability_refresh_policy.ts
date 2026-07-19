/**
 * Successful catalog answers are reused across routine foreground syncs. A
 * day is short enough to discover removals and restorations without sending a
 * user's entire active library to the resolver every time the app wakes.
 */
export const CATALOG_AVAILABILITY_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Missing answers are due immediately; persisted answers expire on a fixed cadence. */
export function catalogAvailabilityNeedsRefresh(checkedAt: Date | undefined, now: Date) {
  return (
    !checkedAt || now.getTime() - checkedAt.getTime() >= CATALOG_AVAILABILITY_REFRESH_INTERVAL_MS
  );
}
