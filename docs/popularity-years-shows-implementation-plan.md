# Popularity for Years + Shows: Implementation Plan

## Goal
Persist the new popularity payload for Years and Shows and expose Popular/Trending sorts in Year and Show filter UIs. Maintain backward compatibility when popularity data is missing.

## Sources / API Shape
- Years list: `GET /api/v3/artists/{artistUuid}/years`
- Year detail with shows: `GET /api/v3/artists/{artistUuid}/years/{yearUuid}`
- Shows on other routes that return shows (ex: recent shows, top shows, etc.)

The new popularity payload matches the artist shape already implemented:
```
"popularity": {
  "momentum_score": 0.7,
  "trend_ratio": 1.1,
  "windows": {
    "48h": { "plays": 123, "hours": 456.7, "hot_score": 2.3 },
    "7d":  { "plays": 456, "hours": 789.1, "hot_score": 3.4 },
    "30d": { "plays": 999, "hours": 111.2, "hot_score": 4.5 }
  }
}
```

## Data Model Updates
1. API models
   - Add `popularity?: Popularity` to `relisten/api/models/year.ts` and `relisten/api/models/show.ts`.
   - Reuse the updated `Popularity` interfaces from `relisten/api/models/artist.ts`.

2. Realm models
   - Ensure `Year` and `Show` Realm models include optional `popularity?: Popularity` in schema and required properties.
   - Implement `propertiesFromApi` mapping using the same `Popularity` conversion logic as `Artist`.
   - Implement `shouldUpdateFromApi` to compare popularity windows + momentum/trend values to avoid stale persisted data.

3. Realm schema
   - Bump schema version and include any new embedded types already used (Popularity/PopularityWindows/PopularityWindow if not yet registered).
   - Confirm existing migrations (if any) won’t crash when `popularity` exists without `windows` and handle nulls defensively.

## UI + Sorting Updates
1. Year filters
   - Update `relisten/components/year_filters.ts` (or equivalent) to add:
     - Popular: `popularity.windows.days30d.hotScore`
     - Trending: `popularity.momentumScore`
   - Ensure numeric sorts and descending direction match current artist behavior.

2. Show filters
   - Update `relisten/components/show_filters.ts` (or equivalent) to add:
     - Popular: `popularity.windows.days30d.hotScore`
     - Trending: `popularity.momentumScore`

3. Year and Show list displays
   - Optional: show a small “30d” play count or a momentum percent in rows, consistent with the artist list behavior.
   - If adding a display detail, make it conditional on the active sort (same approach as artist rows).

## Backward Compatibility
- If `popularity` is missing, keep existing sort order and avoid crashing:
  - Guard on `model.popularity?.windows` when reading.
  - Fallback to `0` for missing `hotScore`/`momentumScore` to keep sorting stable.

## Validation Plan
1. Manually verify API responses
   - Fetch a year list and a year detail with shows; confirm `popularity.windows` is present.
   - Confirm a show payload includes `popularity` on routes that return shows.

2. Realm persistence
   - Confirm persisted Year/Show objects store popularity windows and update if changed.

3. UI behavior
   - Verify Popular/Trending sorts appear for Years and Shows.
   - Verify sorting uses popularity when available and doesn’t break when missing.

## Files Likely Touched
- API models: `relisten/api/models/year.ts`, `relisten/api/models/show.ts`
- Realm models: `relisten/realm/models/year.ts`, `relisten/realm/models/show.ts`
- Realm schema: `relisten/realm/schema.ts`
- UI filters: `relisten/components/year_filters.ts`, `relisten/components/show_filters.ts`
- Optional row display updates: `relisten/components/year_rows.tsx`, `relisten/components/show_rows.tsx`

## Notes
- Use the server code in `/Users/alecgorge/code/relisten/RelistenApi` as reference for payload shapes if needed.
- Keep sorting logic aligned with artists so the UX feels consistent.
