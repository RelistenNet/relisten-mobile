# Aadam Jacobs Collection Mobile Implementation Guide

**Date:** 2026-04-15
**Status:** Draft implementation guide
**Related API contract:** `/Users/alecgorge/code/relisten/RelistenApi/docs/design/2026-04-15-aadam-jacobs-mobile-api-contract.md`

## Summary

Build a first mobile collection surface for the Aadam Jacobs Collection while keeping the app aligned with its current Realm-backed browse architecture. The first shipped UI should expose one simple entry point, an AJC landing screen, a collection artist list, collection year browse, year detail show lists, and playback through the existing show detail routes.

The important implementation constraint is that collection browse data is collection-scoped. Do not persist collection year rows into the existing `Year` model, and do not upsert collection show list rows into the existing `Show` model. The collection endpoints return scoped counts and source availability, so writing those rows into the global artist/show cache can make normal artist screens display AJC-only source counts. Persist collection data in dedicated Realm models and adapt shared UI components to a small summary interface.

Artist data has a different rule: the normal artist catalog should move to a bundled-seed-plus-delta sync path. The bundled artist cache seeds Realm on app start, and `/api/v3/artists/delta?...&include_autocreated=true&include_collection_derived=true` keeps it current. `/api/v3/artists?include_autocreated=true&include_collection_derived=true` remains a fallback and cache-generation source, not the routine app refresh path. The collection artists endpoint is a membership endpoint for mobile, not the canonical artist row source.

## Goals

- Add an AJC collection entry point somewhere simple in the app.
- Render the collection landing screen with collection counts, On This Day, Recently Added, and a chronological year list.
- Render all artists in the collection using canonical artist metadata and total canonical show/source counts from the artist sync path.
- Replace normal artist catalog refreshes with a canonical artist sync that seeds from a bundled `artists-bootstrap.json`, then requests only deltas.
- Render a collection year detail screen with all collection-linked shows for that year.
- Open playback through the existing `/api/v3/shows/{showUuid}` flow and existing artist show routes.
- Persist collection summaries, collection years, collection artist membership, collection show summaries, and collection show list membership in Realm.
- Keep reusable show/year/artist list presentation logic instead of cloning artist screens.
- Hide the Popular / Trending tray in the initial UI because local AJC data currently has empty popularity aggregates.

## Non-Goals

- Do not build a general collection directory UI beyond what AJC needs.
- Do not decide the final product placement for the collection entry point.
- Do not add collection-specific venues, songs, tours, random show, or top-rated screens.
- Do not make AJC artists appear in the normal global artist list by default.
- Do not add a separate collection-specific artist sync path; the regular artist catalog sync must serve all artist consumers.
- Do not persist collection browse rows as global `Show`, `Year`, or `Venue` records.
- Do not persist collection-scoped artist counts into global `Artist` rows or build first-class collection-scoped artist count UI for this slice.
- Do not rebuild the data layer away from Realm as part of this slice.

## Current App Context

The app's browse flows are Realm-backed:

- `RelistenApiClient` in `relisten/api/client.ts` owns API calls, request dedupe, rate limiting, retry, and ETag metadata.
- `NetworkBackedBehavior` and `ThrottledNetworkBackedBehavior` in `relisten/realm/` provide local-first results plus background refresh.
- Artist, year, show, venue, tour, and song repositories live under `relisten/realm/models/`.
- Artist year browse uses `app/relisten/tabs/(artists,myLibrary,offline)/[artistUuid]/index.tsx`, `relisten/pages/artist/years_list.tsx`, and `relisten/pages/artist/years_header.tsx`.
- Year detail show browse uses `ShowListContainer` from `relisten/components/shows_list.tsx`.
- Horizontal discovery trays use `ShowCard` from `relisten/components/show_card.tsx`.
- Playback opens through `ShowLink` / `usePushShowRespectingUserSettings` in `relisten/util/push_show.tsx`, then loads full source graphs through `useFullShowWithSelectedSource()` and `GET /api/v3/shows/{showUuid}`.

## API Contract

Add typed client support for these endpoints:

- `GET /api/v3/artists?include_autocreated=true&include_collection_derived=true`
- `GET /api/v3/artists/delta?since={serverTimestamp}&include_autocreated=true&include_collection_derived=true`
- `GET /api/v3/collections`
- `GET /api/v3/collections/{collectionUuidOrSlug}`
- `GET /api/v3/collections/{collectionUuidOrSlug}/artists`
- `GET /api/v3/collections/{collectionUuidOrSlug}/years`
- `GET /api/v3/collections/{collectionUuidOrSlug}/years/{yearOrYearUuid}`
- `GET /api/v3/collections/{collectionUuidOrSlug}/shows/recently-added?limit=25`
- `GET /api/v3/collections/{collectionUuidOrSlug}/shows/on-this-day?month={month}&day={day}`
- `GET /api/v3/collections/{collectionUuidOrSlug}/shows/popular-trending?limit=25&window=30d`

Playback remains:

- `GET /api/v3/shows/{showUuid}`

Local API smoke checks on 2026-04-15 confirmed the AJC detail row:

```json
{
  "uuid": "784087f9-7d7f-c82a-2195-21380411ac2b",
  "slug": "aadam-jacobs",
  "name": "Aadam Jacobs Collection",
  "item_count": 2477,
  "artist_count": 1444,
  "show_count": 2431,
  "source_count": 2477,
  "indexed_at": "2026-04-15T13:20:43Z"
}
```

Local popularity data currently returned zero popular and trending shows. That supports omitting the Popular / Trending tray from the first UI rather than showing an empty or misleading section.

## Target File Map

Create:

- `assets/catalog/artists-bootstrap.json`: OTA-shipped canonical artist seed generated from the full artist endpoint.
- `tooling/catalog/build-artists-bootstrap.mjs`: Local/release helper that refreshes the bundled artist seed from the API.
- `relisten/api/models/collection.ts`: Collection DTOs, collection year DTOs, collection show-list DTOs, and collection popular/trending DTO.
- `relisten/realm/models/artist_catalog_sync.ts`: Bundled seed ingestion, artist delta/full-fallback sync behavior, and root sync hook.
- `relisten/realm/models/collection.ts`: Realm `Collection` model.
- `relisten/realm/models/collection_year.ts`: Realm `CollectionYear` model with collection-scoped counts.
- `relisten/realm/models/collection_artist.ts`: Realm membership model joining `Collection` and canonical `Artist` rows.
- `relisten/realm/models/collection_show.ts`: Realm collection-scoped show summary model.
- `relisten/realm/models/collection_show_list_entry.ts`: Realm ordered list membership for year, recently-added, on-this-day, and future popularity trays.
- `relisten/realm/models/sync_cursor.ts`: Small generic cursor model for semantic sync timestamps and ingested bundle keys.
- `relisten/realm/models/collection_repo.ts`: Realm-backed collection behaviors and upsert helpers.
- `relisten/components/show_summary.ts`: Shared presentation and navigation interface for global shows and collection show summaries.
- `relisten/components/show_summary_card.tsx`: Shared card body used by existing `ShowCard` and collection trays.
- `relisten/components/show_summary_list_item.tsx`: Shared show row body used by existing `ShowListItem` and collection year detail rows.
- `relisten/pages/collection/collection_header.tsx`: AJC collection header, counts, and navigation buttons.
- `relisten/pages/collection/collection_years_list.tsx`: Collection year list using reusable year row content.
- `relisten/pages/collection/collection_show_tray.tsx`: Generic horizontal collection show tray.
- `app/relisten/tabs/(relisten)/collections/[collectionSlug]/index.tsx`: AJC landing screen.
- `app/relisten/tabs/(relisten)/collections/[collectionSlug]/artists.tsx`: Collection artists screen.
- `app/relisten/tabs/(relisten)/collections/[collectionSlug]/years/[year]/index.tsx`: Collection year detail screen.

Modify:

- `asset-modules.d.ts`: Add JSON module typing for the bundled artist seed if the implementation uses a static import.
- `app/_layout.tsx`: Mount the root artist catalog sync component after Realm and API providers are available.
- `relisten/api/client.ts`: Add collection API methods, artist delta, `include_collection_derived`, and non-`updated_at` response ETag support.
- `relisten/realm/schema.ts`: Register new Realm models and bump schema version.
- `relisten/realm/models/artist.ts`: Add `ArtistFeaturedFlags.CollectionDerived = 1 << 2`.
- `relisten/realm/models/artist_repo.ts`: Replace boolean-only auto-created filtering with an `ArtistVisibility` option and route normal artist refreshes through canonical seed-plus-delta sync.
- `relisten/components/show_card.tsx`: Preserve the current public `ShowCard` API while moving display logic into `ShowSummaryCard`.
- `relisten/components/shows_list.tsx`: Preserve the current public `ShowListContainer` API while moving display logic into `ShowSummaryListItem`.
- `relisten/pages/artist/years_list.tsx`: Extract reusable year row content for collection years.
- `relisten/util/push_show.tsx`: Export a summary-based show href helper or add a `ShowSummaryLink` wrapper that can navigate from a collection show summary plus its resolved artist.
- `app/relisten/tabs/(relisten)/_layout.tsx`: Register the collection stack screens.
- `app/relisten/tabs/(relisten)/index.tsx`: Add the temporary AJC entry point button.

## Responsibility Boundaries

Keep each layer narrow:

- `artist_repo.ts` owns canonical artist persistence and artist visibility. It does not know which collection an artist belongs to.
- `artist_catalog_sync.ts` owns bundled artist cache ingestion, artist delta/full-fallback decisions, and the canonical artist sync cursor. It is the replacement for the current full artist-list route usage, not a collection-only mechanism.
- `collection_repo.ts` owns collection membership, collection rollups, collection show summaries, and collection list membership. It does not overwrite global artist/year/show counts.
- `CollectionArtist` answers only "is this canonical artist in this collection?"
- `CollectionYear` answers only "what are this collection's rollups for this year?"
- `CollectionShow` answers only "what summary fields should collection list rows display for this show?"
- `CollectionShowListEntry` answers only "which collection show summaries are in this ordered list?"
- Shared summary UI components render already-loaded display data and do not fetch or persist.
- Route screens compose repository hooks and navigation; they do not contain persistence logic.

Implementation invariants:

- Only the regular artist catalog sync writes canonical `Artist` rows.
- Collection endpoints never overwrite canonical artist, show, year, venue, song, tour, or source rows.
- Collection artist data is membership only; artist names, slugs, favorite state, and total counts always come from canonical `Artist`.
- Runtime artist refreshes use bundled seed plus delta. The full artist endpoint is for generating the bundle and for repair fallback only.
- Collection upsert helpers attach existing canonical `Artist` links when writing `CollectionArtist` and `CollectionShow`; artist catalog sync also reattaches links after artist upserts. Neither side is the only place links can be repaired.
- UI reuse happens through display interfaces (`ShowSummaryDisplay`, `YearSummaryDisplay`) and adapters, not by forcing collection rows into global Realm models.

## Realm Model Design

### Collection

Persist API collection details:

- `uuid`
- `slug`
- `upstreamIdentifier`
- `name`
- `description`
- `itemCount`
- `artistCount`
- `showCount`
- `sourceCount`
- `indexedAt`
- `createdAt`
- `updatedAt`

The API collection DTO does not currently expose `created_at` or `updated_at`. Use `indexed_at` as the model's `createdAt` / `updatedAt` source when available, and fall back to the fetch completion time only for missing `indexed_at`. Keep this conversion local to collection upsert helpers instead of pretending the API shape is a normal `RelistenApiUpdatableObject`.

### CollectionYear

Persist collection-scoped year rollups:

- `uuid`
- `collectionUuid`
- `year`
- `artistCount`
- `showCount`
- `sourceCount`
- `duration`
- `avgDuration`
- `avgRating`
- `popularity`
- `createdAt`
- `updatedAt`

The existing `Year` model is artist-scoped and requires `artistUuid`. Do not reuse it for collection years.

Because `CollectionYear` DTOs do not expose `updated_at`, the upsert helper must compare the scoped count, duration, rating, and popularity fields directly instead of relying only on timestamp comparisons.

### CollectionArtist

Persist collection artist membership only:

- `uuid`: `${collectionUuid}:${artistUuid}`
- `collectionUuid`
- `artistUuid`
- `createdAt`
- `updatedAt`
- optional `artist: Artist`
- optional `collection: Collection`

The `/collections/{slug}/artists` endpoint returns `ArtistWithCounts[]`, but those counts are scoped to active AJC-linked sources. The mobile app should ignore every field except `uuid` for collection membership. Do not pass this response through `artistRepo.upsertMultiple()`, because that would overwrite global `Artist.showCount` and `Artist.sourceCount` with collection-scoped counts.

Use the regular artist catalog sync for global `Artist` persistence. That sync seeds from `assets/catalog/artists-bootstrap.json`, then calls `/api/v3/artists/delta?...&include_autocreated=true&include_collection_derived=true`; the full `/api/v3/artists?include_autocreated=true&include_collection_derived=true` endpoint is only a cache-generation and repair fallback. Collection artist screens should join `CollectionArtist.artistUuid` to canonical `Artist` rows and display the normal total `Artist.showCount` and `Artist.sourceCount`. When persisting membership, set `CollectionArtist.artist` if that canonical `Artist` already exists. If a membership row exists before its canonical artist has synced, show a loading row or omit it until the normal artist catalog sync resolves it; do not keep a second artist display snapshot in `CollectionArtist`.

Normal artist screens should still filter out `CollectionDerived` artists unless explicitly requested.

### CollectionShow

Persist collection-scoped show summaries:

- `uuid`: `${collectionUuid}:${showUuid}`
- `collectionUuid`
- `showUuid`
- `artistUuid`
- `artistYearUuid`
- `date`
- `displayDate`
- `avgRating`
- `avgDuration`
- `venueName`
- `venueLocation`
- `venuePastNames`
- `sourceCount`
- `hasSoundboardSource`
- `hasStreamableFlacSource`
- `mostRecentSourceUpdatedAt`
- `popularity`
- `createdAt`
- `updatedAt`
- optional `artist: Artist`
- optional `collection: Collection`

Do not upsert collection `Show[]` payloads through `showRepo.upsertMultiple()`. These rows use collection-scoped `source_count`, `has_soundboard_source`, `has_streamable_flac_source`, and `most_recent_source_updated_at`. Persisting them as global `Show` rows can corrupt regular artist/year screens.

Store venue display fields directly on `CollectionShow` instead of upserting `Venue`, because collection show list payloads are summaries and the collection UI only needs display text. Full venue/source detail still comes from the existing show detail flow after the user opens a show.

When persisting a `CollectionShow`, set `CollectionShow.artist` if the canonical `Artist` already exists. If the artist is not present yet, leave the link null; the next artist catalog sync should reattach it, and UI adapters can still resolve artists from a preloaded `Artist` map keyed by `artistUuid`.

Collection-year membership belongs in `CollectionShowListEntry`, not on `CollectionShow`. A single collection show can appear in the year detail list, On This Day, Recently Added, and future popularity lists without duplicating the show summary row.

### CollectionShowListEntry

Persist ordered membership for each collection list:

- `uuid`: `${collectionUuid}:${listKey}:${showUuid}`
- `collectionUuid`
- `listKey`
- `showUuid`
- `collectionShowUuid`
- `sortPosition`
- `createdAt`
- `updatedAt`
- optional `collectionShow: CollectionShow`

Use list keys:

- `years:${year}` for collection year detail.
- `recently-added` for the landing tray.
- `on-this-day:${MM}-${DD}` for the landing tray.
- `popular:${window}` and `trending:${window}` for future popularity trays.

Each network response is authoritative for its list key: remove previous entries for that key, upsert the returned `CollectionShow` snapshots, then recreate entries with stable `sortPosition`.

### SyncCursor

Persist the canonical artist catalog cursor:

- `uuid`: `artist-catalog`
- `cursor`: latest ingested API `server_timestamp`
- `sourceKey`: latest ingested bundled cache key, nullable
- `createdAt`
- `updatedAt`

Use this for both bundled cache ingestion and `/api/v3/artists/delta` responses. The app already has `UrlRequestMetadata`, but that tracks request freshness, not semantic API cursors. Store `cursor` and `sourceKey` only after the corresponding artist upsert transaction succeeds.

Never move `cursor` backward. If the installed app already has a cursor newer than the bundled cache's `server_timestamp`, skip the bundled artist rows and keep the newer cursor. This prevents an older binary or older OTA bundle from forcing the next delta request to redownload historical artist changes.

## Bundled Artist Bootstrap Cache

Ship a generated artist seed with the app bundle:

```txt
assets/catalog/artists-bootstrap.json
```

Use this shape:

```json
{
  "cache_key": "artists-2026-04-15T22:49:13Z-sha256-...",
  "server_timestamp": "2026-04-15T22:49:13Z",
  "include_autocreated": true,
  "include_collection_derived": true,
  "artist_count": 1580,
  "artists": []
}
```

`artists` contains canonical `ArtistWithCounts[]` rows from:

```txt
GET /api/v3/artists?include_autocreated=true&include_collection_derived=true
```

The `cache_key` should change whenever the generated file content changes. A timestamp plus SHA-256 digest is enough. `server_timestamp` is the starting delta cursor for this bundled snapshot.

Valid bundled snapshot cursors:

- Preferred: `max(api_updated_at)` across the exact artist rows serialized into `artists-bootstrap.json`.
- Also valid: the `server_timestamp` from `/api/v3/artists/delta?since=1970-01-01T00:00:00Z&include_autocreated=true&include_collection_derived=true` if the generator uses that delta response as the source rows.

Invalid bundled snapshot cursors:

- Local bundle generation time.
- A separately queried `max(api_updated_at)` that is not tied to the same row snapshot as the serialized artist payload.

The rule is: never set a cursor newer than the data actually included in the bundle. The next delta request uses `api_updated_at > cursor`, so using a timestamp for an artist change that was not serialized into the bundle can skip that change. Runtime `/artists/delta` can keep returning its captured database upper bound because the backend query is bounded with `api_updated_at > since AND api_updated_at <= server_timestamp`.

Startup ingestion order:

1. Read `SyncCursor("artist-catalog")`.
2. Load `assets/catalog/artists-bootstrap.json`.
3. If no cursor exists, or the bundle `server_timestamp` is newer than the stored cursor, upsert bundled artists into Realm unless `sourceKey` already equals `cache_key`.
4. After the upsert succeeds, set `cursor = server_timestamp` and `sourceKey = cache_key`.
5. If the stored cursor is newer than the bundle `server_timestamp`, skip bundle ingestion and do not roll the cursor back. If timestamps are equal and `sourceKey` differs, it is safe to ingest and update `sourceKey`, but the cursor must remain the same.
6. Fetch `/api/v3/artists/delta?since={cursor}&include_autocreated=true&include_collection_derived=true`.
7. Upsert delta artists, then store the returned `server_timestamp` while preserving the last ingested `sourceKey`.

This makes OTA updates useful: a newer OTA can carry a fresher artist snapshot, so the first network request after update is a small delta rather than a full artist download. The full artist endpoint should not be hit during normal app startup or normal artist browse refreshes.

## API Client Work

1. Add `relisten/api/models/collection.ts`.

   Define:

   - `CollectionSummary`
   - `CollectionDetail`
   - `CollectionYear`
   - `CollectionYearWithShows`
   - `CollectionPopularTrendingShowsResponse`

   Reuse existing `ArtistWithCounts`, `Show`, and `Popularity` types for response fields.

   Add `ArtistDeltaResponse` and `ArtistBootstrapCache` to `relisten/api/models/artist.ts`, because artist delta and the bundled seed are part of canonical artist sync rather than collection browse.

2. Update `RelistenApiClient.artists()`.

   Replace the boolean-only signature with an options object while preserving the existing call sites:

   ```ts
   type ArtistsRequestOptions = {
     includeAutomaticallyCreated?: boolean;
     includeCollectionDerived?: boolean;
   };
   ```

   Generate `/v3/artists?include_autocreated=true&include_collection_derived=true` when requested.

3. Add `RelistenApiClient.artistDelta()`.

   ```ts
   artistDelta(
     since: string,
     options: ArtistsRequestOptions,
     requestOptions?: RelistenApiRequestOptions
   ): Promise<RelistenApiResponse<ArtistDeltaResponse>>
   ```

   For canonical catalog sync, request deltas with `include_autocreated=true&include_collection_derived=true`. Store `server_timestamp` only after a successful response and successful Realm write.

4. Add collection client methods.

   ```ts
   collections()
   collection(collectionUuidOrSlug: string)
   collectionArtists(collectionUuidOrSlug: string)
   collectionYears(collectionUuidOrSlug: string)
   collectionYear(collectionUuidOrSlug: string, yearOrYearUuid: string)
   collectionRecentlyAddedShows(collectionUuidOrSlug: string, limit = 25)
   collectionOnThisDayShows(collectionUuidOrSlug: string, month: number, day: number)
   collectionPopularTrendingShows(collectionUuidOrSlug: string, limit = 25, window = '30d')
   ```

5. Loosen `getJson<T>()` enough to support collection DTOs.

   The current generic requires `uuid` and `updated_at`. Collection DTOs do not all have `updated_at`, and popular/trending returns a wrapper object. Keep ETag caching, but make `calculateEtag()` accept unknown JSON:

   - If every payload item has `uuid` and `updated_at`, keep the existing compact `uuid + updated_at` digest.
   - Otherwise digest `JSON.stringify(payload)`.

   This avoids adding fake API fields and keeps request metadata useful for collection responses.

## Artist Visibility and Sync

Add `CollectionDerived = 1 << 2` to the mobile `ArtistFeaturedFlags` enum. Backend collection-derived artists use `AutoCreated | CollectionDerived`, which is numeric `6`.

Replace the current `featured != AutoCreated` Realm filter. That filter excludes only `2` and will leak `6` into normal artist lists after AJC artists are persisted.

Use a helper that enumerates visible flag values and queries with `featured IN $0`:

```ts
type ArtistVisibility = {
  includeAutomaticallyCreated: boolean;
  includeCollectionDerived: boolean;
};

function visibleArtistFeaturedValues(visibility: ArtistVisibility): number[] {
  const allValues = [0, 1, 2, 3, 4, 5, 6, 7];

  return allValues.filter((featured) => {
    const isAutoCreated = (featured & ArtistFeaturedFlags.AutoCreated) !== 0;
    const isCollectionDerived = (featured & ArtistFeaturedFlags.CollectionDerived) !== 0;

    if (isCollectionDerived) {
      return visibility.includeCollectionDerived;
    }

    return visibility.includeAutomaticallyCreated || !isAutoCreated;
  });
}
```

Normal artist tabs should query Realm with:

```ts
{ includeAutomaticallyCreated: false, includeCollectionDerived: false }
```

The existing "All Artists" screen can keep including non-collection auto-created artists while still excluding collection-derived rows by default:

```ts
{ includeAutomaticallyCreated: true, includeCollectionDerived: false }
```

The canonical artist catalog sync should fetch with:

```ts
{ includeAutomaticallyCreated: true, includeCollectionDerived: true }
```

That asymmetry is intentional. The local query keeps AJC-only artists out of normal artist lists by default, while the fetch path keeps all canonical rows in Realm so existing all-artist/single-artist flows, collection membership, show navigation, and direct artist links can resolve them.

Replace the existing full-list artist refresh behavior with `useArtistCatalogSync()` from `relisten/realm/models/artist_catalog_sync.ts`. The hook should:

1. Ingest the bundled `artists-bootstrap.json` when no cursor exists, or when its `server_timestamp` is newer than `SyncCursor("artist-catalog").cursor` and its `cache_key` differs from `sourceKey`; if timestamps are equal, ingest only to record a different `sourceKey` and never move the cursor backward.
2. Fetch `/api/v3/artists/delta?since={cursor}&include_autocreated=true&include_collection_derived=true`.
3. Upsert returned artists into Realm.
4. Reattach any matching `CollectionArtist.artist` and `CollectionShow.artist` links.
5. Store the new `server_timestamp` after the Realm transaction commits.

If no cursor exists and the bundled seed is missing or corrupt, fall back to `/api/v3/artists/delta?since=1970-01-01T00:00:00Z&include_autocreated=true&include_collection_derived=true`, store the response as canonical `Artist` rows, and then store the returned `server_timestamp`. A full `/api/v3/artists?include_autocreated=true&include_collection_derived=true` request is only safe as a repair fallback if the implementation can also produce a valid cursor for the exact returned rows. That fallback is a repair path, not the normal first-run path.

Mount the sync once in `app/_layout.tsx` after `RealmBridge` and inside `RelistenApiProvider`. `useArtists()`, `useAllArtists()`, `useArtist()`, and collection artist screens should all read the same Realm-backed artist catalog; they should not each own a separate full artist fetch. Pull-to-refresh in artist list screens can rerun the same delta sync. The operation is idempotent because it uses the stored cursor and upserts by artist UUID; extra forced deltas are acceptable.

The artist list and delta endpoints are the only source for artist display names, slugs, features, favorite state, and total show/source counts. The collection artist endpoint answers "which artists are in this collection"; it does not answer "what should this artist row display."

## Repository Behaviors

Create `relisten/realm/models/collection_repo.ts` with these public hooks:

- `useCollections()`
- `useCollection(collectionUuidOrSlug: string)`
- `useCollectionArtists(collectionUuidOrSlug: string)`
- `useCollectionYears(collectionUuidOrSlug: string)`
- `useCollectionYearShows(collectionUuidOrSlug: string, year: string)`
- `useCollectionRecentlyAddedShows(collectionUuidOrSlug: string, limit?: number)`
- `useCollectionOnThisDayShows(collectionUuidOrSlug: string, asOf?: Date)`

Each hook should return `NetworkBackedResults<T>` and use the same local-first behavior as the existing artist/year repositories.

Recommended local result shapes:

```ts
type CollectionLandingData = {
  collection: Collection | null;
  years: Realm.Results<CollectionYear>;
  recentlyAddedEntries: Realm.Results<CollectionShowListEntry>;
  onThisDayEntries: Realm.Results<CollectionShowListEntry>;
};

type CollectionYearShowsData = {
  collection: Collection | null;
  year: CollectionYear | null;
  entries: Realm.Results<CollectionShowListEntry>;
};

type CollectionArtistsData = {
  collection: Collection | null;
  memberships: Realm.Results<CollectionArtist>;
};
```

Use `mergeNetworkBackedResults()` for screens that need multiple repositories. Keep each behavior focused:

- Collection detail behavior fetches and persists one `Collection`.
- Collection years behavior fetches and persists `CollectionYear[]`.
- Collection artists behavior fetches scoped collection artists, extracts `artist.uuid`, persists `CollectionArtist[]` membership only, and attaches existing canonical `Artist` links by `artistUuid`.
- Collection show list behaviors fetch a `Show[]`, persist `CollectionShow[]`, attach existing canonical `Artist` links by `artistUuid`, and replace `CollectionShowListEntry[]` for one list key.

`artist_catalog_sync.ts` owns the normal artist catalog sync. After it upserts canonical `Artist[]`, it should reattach `CollectionArtist.artist` and `CollectionShow.artist` links for matching rows. Collection upsert helpers should do the symmetric repair when collection rows arrive after artists. That keeps artist sync reusable and keeps collection repositories responsible only for collection-scoped data.

For stale deletion behavior:

- Collection years and collection artists endpoints are authoritative for AJC; delete missing `CollectionYear` / `CollectionArtist` rows for that collection.
- Show list endpoints are authoritative only for the specific list key; delete missing `CollectionShowListEntry` rows for that key, not `CollectionShow` rows globally.
- Keep old `CollectionShow` snapshots until no list entries reference them, or leave them as harmless cache rows. Do not delete global `Show` rows.

## Reusable UI Design

### Show Summary

Create a small display interface independent of Realm's global `Show` model:

```ts
export type ShowSummaryDisplay = {
  showUuid: string;
  artistUuid: string;
  artist: Artist | null;
  displayDate: string;
  date: Date;
  venueName?: string;
  venueLocation?: string;
  venuePastNames?: string;
  avgRating: number;
  avgDuration?: number;
  sourceCount: number;
  hasSoundboardSource: boolean;
  hasStreamableFlacSource: boolean;
  popularity?: Popularity;
  isFavorite?: boolean;
};
```

Add adapters:

- `showSummaryFromShow(show: Show): ShowSummaryDisplay`
- `showSummaryFromCollectionShow(show: CollectionShow): ShowSummaryDisplay`

Refactor `ShowListItemView` and `ShowCardContents` so both global shows and collection show summaries use the same display body. Preserve the existing `ShowListContainer` and `ShowCard` public APIs by adapting `Show` internally.

Add collection wrappers:

- `CollectionShowListItem`
- `CollectionShowCard`

These wrappers should no-op navigation when `artist` is still missing, then become tappable as soon as canonical artist sync resolves the artist.

### Show Navigation

Export a summary-based helper from `relisten/util/push_show.tsx`:

```ts
export type ShowNavigationTarget = {
  artist: Artist;
  showUuid: string;
  sourceUuid?: string;
  playTrackUuid?: string;
  overrideGroupSegment?: RelistenTabGroupSegment;
};
```

Keep the existing `ShowLink` behavior for global `Show` rows. Add `ShowSummaryLink` that accepts a `ShowSummaryDisplay` and routes to the existing `(artists)` show stack when `artist` is available.

Collection screens live under the `(relisten)` tab, whose layout already provides `groupSegment="(artists)"`. Use `overrideGroupSegment: "(artists)"` explicitly from collection cards and rows so playback always opens in the normal artist route tree.

### Year Summary

Extract the display body from `relisten/pages/artist/years_list.tsx`:

```ts
type YearSummaryDisplay = {
  uuid: string;
  year: string;
  showCount: number;
  sourceCount: number;
  popularity?: Popularity;
};
```

Add adapters:

- `yearSummaryFromYear(year: Year)`
- `yearSummaryFromCollectionYear(year: CollectionYear)`

Keep artist year routing unchanged. Add a collection year row wrapper that links to:

```ts
/relisten/tabs/(relisten)/collections/[collectionSlug]/years/[year]
```

### Artist Rows

Do not fork or extend `ArtistListItem` for collection-specific counts. The collection artist screen should derive a list of canonical `Artist` rows from membership `artistUuid` values and render the existing `ArtistListItem` unchanged. Prefer `CollectionArtist.artist` when linked, but also build a preloaded canonical artist map by UUID so rows still resolve when membership is written after the last artist sync. This keeps artist display and counts canonical and avoids a second artist presentation contract. If an artist is genuinely missing from the canonical catalog, keep that membership out of the rendered list while a loading state is active rather than inventing partial row data.

## Screens and Routes

### Entry Point

Add a temporary row in `app/relisten/tabs/(relisten)/index.tsx` near the existing "Recently Played" and "Random Show" actions:

- Title: `Aadam Jacobs Collection`
- Subtitle: `Browse newly transferred Archive.org recordings by year or artist.`
- Button: `Open`
- Route: `/relisten/tabs/(relisten)/collections/aadam-jacobs`

This is intentionally plain. Product placement can improve later without blocking implementation.

### Stack Registration

Update `app/relisten/tabs/(relisten)/_layout.tsx`:

- `collections/[collectionSlug]/index`: title starts empty and is set to collection name.
- `collections/[collectionSlug]/artists`: title `Artists`.
- `collections/[collectionSlug]/years/[year]`: title set to the year.

### Collection Landing

Route:

```txt
app/relisten/tabs/(relisten)/collections/[collectionSlug]/index.tsx
```

Data:

- `useCollection(collectionSlug)`
- `useCollectionYears(collectionSlug)`
- `useCollectionRecentlyAddedShows(collectionSlug, 25)`
- `useCollectionOnThisDayShows(collectionSlug, new Date())`
- `useCollectionArtists(collectionSlug)` to seed collection artist membership
- canonical artist metadata comes from the root `useArtistCatalogSync()` mounted in `app/_layout.tsx`

UI order:

1. Header with collection name and counts.
2. Action row with `Artists`.
3. On This Day tray if there are entries or if loading with no cached data.
4. Recently Added tray if there are entries or if loading with no cached data.
5. Chronological year list.

Default year sort is ascending date. Persist filter state under:

```txt
collections/aadam-jacobs/years
```

Do not render Popular / Trending in the first UI. Keep API and Realm list-key support ready for a later tray, but omit it from the screen until playback aggregates are meaningful.

### Collection Artists

Route:

```txt
app/relisten/tabs/(relisten)/collections/[collectionSlug]/artists.tsx
```

Data:

- `useCollectionArtists(collectionSlug)`
- canonical `Artist` rows from the regular Realm-backed artist catalog

UI:

- Filterable list using existing artist sort/search controls where practical.
- Render `ArtistListItem` with canonical `Artist` objects resolved from membership `artistUuid` values.
- Display canonical `Artist.showCount` and `Artist.sourceCount`, not AJC-scoped counts.
- Rows link to the normal artist detail route:

```txt
/relisten/tabs/(artists)/[artistUuid]
```

This is intentional: reused artists can show non-AJC content after drilldown.

### Collection Year Detail

Route:

```txt
app/relisten/tabs/(relisten)/collections/[collectionSlug]/years/[year]/index.tsx
```

Data:

- `useCollectionYearShows(collectionSlug, year)`

UI:

- Header displays `year`, scoped show count, and scoped tape count.
- `ShowListContainer` equivalent using `CollectionShowListItem`.
- `showArtist` should be true for rows because collection years span many artists.
- Default sort is date ascending.
- Search should include display date, artist name, venue name, and venue location.

Opening a row navigates through the existing show route and loads full playback data from `/api/v3/shows/{showUuid}`.

## Implementation Plan

### Task 1: Add API Types and Client Methods

Files:

- Create `relisten/api/models/collection.ts`
- Modify `relisten/api/client.ts`
- Modify `relisten/api/models/artist.ts`

Steps:

- Define collection DTOs exactly from the API contract.
- Add artist request options, `ArtistDeltaResponse`, `ArtistBootstrapCache`, and `artistDelta()`.
- Add collection endpoint methods.
- Update `getJson<T>()` and `calculateEtag()` to handle DTOs without `updated_at`.
- Run `yarn ts:check` before moving to Realm models; this should catch route method typing mistakes early.

### Task 2: Add Realm Models and Schema Version

Files:

- Create `relisten/realm/models/collection.ts`
- Create `relisten/realm/models/collection_year.ts`
- Create `relisten/realm/models/collection_artist.ts`
- Create `relisten/realm/models/collection_show.ts`
- Create `relisten/realm/models/collection_show_list_entry.ts`
- Create `relisten/realm/models/sync_cursor.ts`
- Modify `relisten/realm/schema.ts`
- Modify `relisten/realm/models/artist.ts`

Steps:

- Add all new schemas with stable primary keys and indexed fields used by collection queries.
- Add `SyncCursor.sourceKey` for the ingested bundled artist cache key.
- Add `ArtistFeaturedFlags.CollectionDerived = 1 << 2`.
- Bump Realm schema version from `12` to `13`.
- Keep the migration additive. New models do not require backfilling existing rows.
- Run `yarn ts:check`.

### Task 3: Replace Artist Full Refresh With Seeded Delta Sync

Files:

- Create `assets/catalog/artists-bootstrap.json`
- Create `tooling/catalog/build-artists-bootstrap.mjs`
- Create `relisten/realm/models/artist_catalog_sync.ts`
- Modify `asset-modules.d.ts`
- Modify `relisten/realm/models/artist_repo.ts`
- Modify `app/_layout.tsx`

Steps:

- Add a generated `artists-bootstrap.json` with `cache_key`, `server_timestamp`, `include_autocreated=true`, `include_collection_derived=true`, `artist_count`, and `artists`.
- Add a script that generates the cache from `/api/v3/artists?include_autocreated=true&include_collection_derived=true` and sets `server_timestamp` to `max(api_updated_at)` for the exact serialized rows, or from `/api/v3/artists/delta?since=1970-01-01T00:00:00Z&include_autocreated=true&include_collection_derived=true` if the delta response is the simplest source with a reliable cursor.
- Have the script print `artist_count`, `server_timestamp`, `cache_key`, and output file size so release/OTA reviewers can see the bundled cost.
- Replace the current `featured != AutoCreated` query with `featured IN visibleArtistFeaturedValues(...)`.
- Keep `useArtists()` behavior unchanged for normal tabs.
- Keep `useAllArtists()` including non-collection auto-created artists, but exclude `CollectionDerived` rows unless a caller explicitly opts in.
- Add `useArtistCatalogSync()` that ingests the bundled cache, advances `SyncCursor("artist-catalog")`, and then fetches artist deltas.
- Replace `artistsNetworkBackedBehavior` network fetches with the same catalog sync path so normal artist list refreshes are delta-driven.
- Update `useAllArtists()` and `ArtistBootstrapNetworkBackedBehavior` to use the same canonical catalog sync path rather than calling the full artist route directly.
- Keep full `/api/v3/artists?include_autocreated=true&include_collection_derived=true` as a fallback only when the bundled cache is absent/corrupt, no cursor exists, and the fallback can produce a valid cursor for the exact returned rows; otherwise use delta since epoch for repair.
- Mount the root sync in `app/_layout.tsx` after `RealmBridge` and inside `RelistenApiProvider`.
- Allow artist list pull-to-refresh to rerun the same delta sync; no separate refresh controller is required for this slice.
- Reattach `CollectionArtist.artist` and `CollectionShow.artist` links after canonical artist upserts.
- Attach existing canonical `Artist` links when collection membership and collection show rows are written.
- Verify the first app-start request after a fresh install is an artist delta using the bundled `server_timestamp`, not the full artist route.
- Verify after visiting the collection that normal "All Artists" does not show `featured=6` AJC-only artists.

### Task 4: Implement Collection Repositories

Files:

- Create `relisten/realm/models/collection_repo.ts`

Steps:

- Implement collection upsert helpers first.
- Implement `useCollection()` and `useCollectionYears()`.
- Implement `useCollectionArtists()` and verify it persists only `CollectionArtist` membership rows.
- Implement `useCollectionRecentlyAddedShows()`.
- Implement `useCollectionOnThisDayShows()`.
- Implement `useCollectionYearShows()`.
- Use `CollectionShowListEntry` for ordered lists.
- Do not call `upsertShowList()` for collection show-list payloads.
- Run `yarn ts:check`.

### Task 5: Extract Reusable Summary UI

Files:

- Create `relisten/components/show_summary.ts`
- Create `relisten/components/show_summary_card.tsx`
- Create `relisten/components/show_summary_list_item.tsx`
- Modify `relisten/components/show_card.tsx`
- Modify `relisten/components/shows_list.tsx`
- Modify `relisten/pages/artist/years_list.tsx`
- Modify `relisten/util/push_show.tsx`

Steps:

- Extract a `ShowSummaryDisplay` adapter layer.
- Keep existing `ShowCard` and `ShowListContainer` call sites working.
- Add collection wrappers that render `CollectionShow`.
- Extract reusable year row display.
- Export a summary-based show navigation wrapper.
- Run `yarn lint` and `yarn ts:check`.

### Task 6: Build Collection Screens

Files:

- Create `relisten/pages/collection/collection_header.tsx`
- Create `relisten/pages/collection/collection_years_list.tsx`
- Create `relisten/pages/collection/collection_show_tray.tsx`
- Create `app/relisten/tabs/(relisten)/collections/[collectionSlug]/index.tsx`
- Create `app/relisten/tabs/(relisten)/collections/[collectionSlug]/artists.tsx`
- Create `app/relisten/tabs/(relisten)/collections/[collectionSlug]/years/[year]/index.tsx`
- Modify `app/relisten/tabs/(relisten)/_layout.tsx`
- Modify `app/relisten/tabs/(relisten)/index.tsx`

Steps:

- Add the temporary AJC entry point.
- Register collection stack screens.
- Build the collection landing page with header, Artists action, On This Day tray, Recently Added tray, and years list.
- Build the collection artists list.
- Build the collection year detail list.
- Hide Popular / Trending in the landing page.
- Run `yarn lint` and `yarn ts:check`.

### Task 7: Manual QA Against Local API

Use local API first because AJC endpoints are not fully deployed.

For iOS Simulator, point the API base at:

```ts
http://localhost:3823/api
```

For physical devices or Android emulators, use the host machine IP or emulator host alias as appropriate. Do not commit a machine-specific API base override.

Run API smoke checks:

```bash
BASE_URL=http://localhost:3823

curl -fsS "$BASE_URL/api/v3/collections/aadam-jacobs" \
  | jq '{uuid, slug, item_count, indexed_at, artist_count, show_count, source_count}'

curl -fsS "$BASE_URL/api/v3/artists/delta?since=1970-01-01T00:00:00Z&include_autocreated=true&include_collection_derived=true" \
  | jq '{server_timestamp, artist_count: (.artists | length)}'

node tooling/catalog/build-artists-bootstrap.mjs "$BASE_URL" \
  && jq '{cache_key, server_timestamp, include_autocreated, include_collection_derived, artist_count}' \
    assets/catalog/artists-bootstrap.json

curl -fsS "$BASE_URL/api/v3/collections/aadam-jacobs/years" \
  | jq '.[0] | {uuid, collection_uuid, year, artist_count, show_count, source_count}'

curl -fsS "$BASE_URL/api/v3/collections/aadam-jacobs/shows/recently-added?limit=5" \
  | jq '.[] | {uuid, artist_uuid, display_date, source_count, most_recent_source_updated_at}'
```

Manual app checks:

- Fresh install seeds canonical artists from `assets/catalog/artists-bootstrap.json` before the first network artist request.
- The bundled `server_timestamp` equals `max(api_updated_at)` for the exact serialized artist rows, or the server-provided delta cursor when the bundle is generated from `artists/delta`.
- The first artist network request after bootstrap is `/api/v3/artists/delta?since={bundledServerTimestamp}&include_autocreated=true&include_collection_derived=true`.
- OTA with a newer `artists-bootstrap.json` ingests the newer bundle and advances `SyncCursor("artist-catalog")` before the delta request.
- Installing an older binary or older OTA does not roll `SyncCursor("artist-catalog").cursor` backward.
- Pull-to-refresh on artist lists can rerun artist delta sync without duplicating artists or regressing the cursor.
- Relisten tab shows the AJC entry point.
- Opening AJC renders collection counts and year list from cached Realm data after the first load.
- On This Day and Recently Added trays render collection shows with artist names once canonical artist sync has run.
- Popular / Trending is not visible.
- The Artists screen shows canonical total artist counts.
- Tapping a collection artist opens the normal artist page.
- Tapping a collection year opens all collection shows for that year.
- Tapping a collection show opens the existing show source screen and playback works.
- Pull-to-refresh updates collection detail, years, artists, and trays without duplicating rows.
- After visiting AJC, normal global artist lists still exclude collection-derived artists.
- Normal artist year/show screens do not show AJC-scoped source counts caused by collection browsing.
- Collection artist membership does not overwrite canonical artist counts.

Final verification:

```bash
yarn lint
yarn ts:check
```

## Risk Notes

- The biggest data risk is accidentally writing collection-scoped show payloads into global `Show`. Keep collection summaries separate.
- The same scoped-count rule applies to `/collections/{slug}/artists`; ignore scoped count fields there and do not overwrite global `Artist.showCount` or `Artist.sourceCount` from collection artist membership responses.
- The biggest catalog-sync risk is a cursor rollback from an older bundled artist cache. Compare `server_timestamp` before ingestion and never move `SyncCursor("artist-catalog").cursor` backward.
- The biggest performance risk is accidentally leaving a normal startup/list refresh path that still hits the full artist endpoint. Verify network logs show bundled seed ingestion followed by delta requests.
- Artist tombstones are not required for this slice because artists are not deleted. If an artist's flags or counts change, it should appear in artist delta with an updated `api_updated_at`; collection membership deletion remains scoped to `CollectionArtist`.
- The bundled JSON may become large. That is acceptable for this slice because OTA can carry it, but the generation script should report file size and artist count so the cost is visible before release.
- The biggest UI risk is hiding rows while canonical artist metadata is still syncing. Mount root artist catalog sync on app startup, seed `useCollectionArtists()` on the landing screen, and render disabled rows only when an artist is genuinely missing.
- The biggest product risk is the entry point. Keep it deliberately temporary and isolated in the Relisten tab.
- The biggest API risk before deployment is local endpoint instability. Treat non-200 local smoke checks as backend blockers, not mobile UI bugs.

## Rollout Shape

Use reviewable commits:

1. API types/client + artist flag support.
2. Realm collection models + schema bump.
3. Bundled artist catalog seed + delta replacement for normal artist refresh.
4. Collection repositories and scoped membership persistence.
5. Shared summary UI extraction.
6. Collection screens and temporary entry point.
7. Verification fixes.

This keeps the high-risk data model work separate from the UI work and makes it easier to inspect whether collection-scoped data ever touches global show/year persistence.
