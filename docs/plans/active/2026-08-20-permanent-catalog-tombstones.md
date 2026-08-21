# Keep Realm catalog objects valid with permanent tombstones

This ExecPlan is a living document. Keep the sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective up to date as work proceeds.

## Purpose / Big Picture

An API refresh may remove an artist, show, source, or track from the current catalog. The app must mark that Realm row with `deletedAt`. It must never physically delete the row.

Most catalog screens hide rows with `deletedAt != nil`. Playback history, the current queue, downloads, favorites, My Library, and the matching CarPlay views may still use those rows. A tombstoned catalog row remains a valid Realm object, so those features can keep old metadata without an invalid-object crash.

Older app versions may already have deleted catalog rows and left missing Realm links behind. A small startup repair runs before Realm consumers mount. It restores known links when the target still exists. It hides catalog rows that cannot be repaired and deletes malformed leaf rows.

The steady-state rule is simple:

> Repair the database at startup. Never hard-delete catalog rows. Trust catalog links after startup.

## Terms

**Catalog row** means an `Artist`, `Year`, `Show`, `Venue`, `Tour`, `Song`, `Source`, `SourceSet`, or `SourceTrack` Realm object.

**Active row** means a catalog row with `deletedAt == nil`.

**Tombstone** means a catalog row with `deletedAt != nil`. A catalog tombstone remains in Realm permanently.

**Retained read** means a read that may return a tombstone because the feature represents earlier user activity or local ownership.

**Leaf row** means a row that no catalog object depends on for its identity. `PlaybackHistoryEntry`, `SourceTrackOfflineInfo`, and `LastFmScrobbleEntry` are leaf rows. `PlayerState` is a singleton that stores UUID strings. These rows may still be physically deleted.

## Priorities

Use this order when two goals conflict:

1. Do not invalidate a catalog object.
2. Keep the implementation easy to read and change.
3. Do not expose a catalog row with a missing required link.
4. Hide tombstones from normal browsing.
5. Match every remote deletion exactly.

The implementation may keep stale catalog rows when the API does not provide a clear complete list. Stale data is preferable to more reconciliation machinery.

## Progress

- [x] (2026-08-20) Start `codex/permanent-catalog-tombstones` from `origin/main`.
- [x] (2026-08-20) Audit Realm deletion sites, catalog relationships, read sites, and startup paths on the fresh branch.
- [x] (2026-08-20) Write the first plan. No production code changed.
- [x] (2026-08-20) Simplify the plan after design review. Keep the current repository API and membership behavior. Replace read-time graph validation with startup repair.
- [x] (2026-08-20) Complete consistency, crash-invariant, and minimality reviews of the revised plan.
- [x] (2026-08-21 01:18Z) Approve the revised plan and start implementation from `origin/main` at `7c1b74d`.
- [x] (2026-08-21 01:22Z) Add catalog tombstones, repository soft deletion and resurrection, and four focused real-Realm tests.
- [ ] Add active filters at normal catalog query roots.
- [ ] Add startup repair and focused leaf-consumer safety fixes.
- [ ] Add focused tests, run repository checks, and complete manual crash scenarios.
- [ ] Review the implementation, then simplify the changed code without changing behavior.

## Surprises & Discoveries

- Observation: `Repository.upsertMultiple()` is the only current source of physical catalog deletion. Evidence: `relisten/realm/repository.ts` calls `realm.delete()` for models missing from an API response.
- Observation: every current `Repository` instance manages one of the nine catalog types. Evidence: the repositories in `relisten/realm/models/` instantiate `Repository` only for those types.
- Observation: `upsertMultiple()` already supports both required omission rules. `performDeletes=false` preserves omitted rows. `performDeletes=true` treats omissions as deletions. A second repository API would duplicate this behavior.
- Observation: `Source.sourceSets` and `SourceSet.sourceTracks` are current ordered memberships. Replacing either Realm list does not delete or invalidate its former members. Evidence: `relisten/realm/models/show_repo.ts` replaces the lists with `splice()`, while physical deletion occurs separately in `Repository`.
- Observation: some list behaviors use the same filtered Realm results for display and reconciliation. This can cause a missed tombstone. It cannot invalidate an object after repository deletion becomes soft. The first implementation accepts this stale-data case.
- Observation: Realm object links can become `nil` after an older build physically deleted their target, even when TypeScript treats the property as required. A `deletedAt` migration cannot restore those links.
- Observation: `PlaybackHistoryReporter` reads a managed history entry after an `await`. History clear can physically delete that leaf entry during the request. This boundary needs a plain UUID snapshot and a fresh lookup after the request.
- Observation: the React Realm provider and the non-React `openRealm()` path can expose Realm. Both paths must run the same idempotent startup repair before returning consumers.
- Observation: a managed optional Realm date reads as `null` when empty, although the TypeScript model uses an optional property. Evidence: the real-Realm repository tests pass by using `== null` in lifecycle code and asserting `null` at the managed read boundary.

## Decision Log

- Decision: never physically delete a catalog row. Rationale: React, CarPlay, the player, and asynchronous callbacks can keep managed catalog objects after reconciliation. Date: 2026-08-20.
- Decision: use one optional indexed field named `deletedAt` on every catalog model. Rationale: the field states the remote catalog condition and supports active queries. Date: 2026-08-20.
- Decision: keep `Repository.upsertMultiple()` and its existing omission controls. Rationale: the current API already expresses merge-only and complete-list behavior. New method names add no capability. Date: 2026-08-20.
- Decision: keep `Source.sourceSets` and `SourceSet.sourceTracks` as current API membership. Rationale: historical membership would force every list reader to understand two meanings. Date: 2026-08-20.
- Decision: repair known legacy damage once at startup. Do not validate every catalog relationship at every read. Rationale: a startup invariant keeps lifecycle code in one place. Date: 2026-08-20.
- Decision: filter `deletedAt` only at normal catalog query roots. Do not wrap Realm objects or inspect every linked object. Rationale: tombstoned links remain valid and may show stale metadata without crashing. Date: 2026-08-20.
- Decision: keep physical deletion for history, offline metadata, Last.fm queue rows, and `PlayerState`. Rationale: these are leaf or singleton records. Known asynchronous holders must copy identifiers before deletion can occur. Date: 2026-08-20.
- Decision: do not add catalog garbage collection, reference counting, graph traversal, per-access telemetry, proxies, or a persistent repair-state table. Rationale: none is required to stop catalog invalidation. Date: 2026-08-20.

## Outcomes & Retrospective

No implementation has started. Complete this section after the code and manual scenarios are finished.

## Context and Orientation

`relisten/realm/repository.ts` creates, updates, and currently deletes all nine catalog model types. Its `upsertMultiple()` method receives API rows, a local comparison set, `performDeletes`, `queryForModel`, and an optional preservation callback.

`relisten/realm/network_backed_model_array_behavior.ts` passes list results to `upsertMultiple()`. The existing call structure remains. This plan does not split display and reconciliation into separate repository operations.

`relisten/realm/models/show_repo.ts` writes a full Show response. It replaces `Source.sourceSets` and `SourceSet.sourceTracks` with the current API order. That behavior remains.

`relisten/realm/schema.ts` owns schema version 12 and the non-React `openRealm()` function. `app/_layout.tsx` mounts the React `RealmProvider`, then constructs the library index, player, history reporter, and CarPlay services.

`relisten/playback_history_reporter.ts` and `relisten/offline/download_manager.ts` own the two leaf lifecycles that can overlap asynchronous work. Offline callbacks already re-check or re-fetch deleted metadata. History reporting does not.

## Plan of Work

The implementation has four requirements:

1. A catalog row is never passed to `realm.delete()`.
2. A successful API response restores a tombstone with the same UUID.
3. Normal catalog queries hide their own tombstoned rows.
4. Startup repair establishes required-link invariants before any Realm consumer mounts.

### 1. Add the catalog field and change repository deletion

In each of the nine catalog model files, add this Realm property and TypeScript field:

```ts
deletedAt: { type: 'date', optional: true, indexed: true }
deletedAt?: Date;
```

Repeat the one-line schema property in each model. Do not create a schema-property factory or a catalog base class for this change.

Add optional `deletedAt` to the existing `RelistenObjectRequiredProperties` interface so `Repository` can read and write the field without casts. Do not add another model hierarchy.

Increase `schemaVersion` in `relisten/realm/schema.ts` from 12 to 13. The field is optional, so existing catalog rows open with `deletedAt == nil`.

Keep the name and call pattern of `Repository.upsertMultiple()`.

Change its `performDeletes` branch as follows:

- Set `deletedAt` on an omitted model instead of calling `realm.delete(model)`.
- Keep the first deletion time when the same response omits the row again.
- Keep the existing `deleted` result count and log wording. In this repository, catalog deletion now means a tombstone.

Change positive upsert behavior as follows:

- Clear `deletedAt` whenever the API returns an existing model.
- Clear it before the `updatedAt` comparison. A same-timestamp response must restore the existing primary-key row.
- Keep direct catalog links on a tombstone. Do not clear a link because its target has `deletedAt`.

The Artist list currently preserves favorite or downloaded Artists from physical deletion. Stop passing that preservation callback. A missing favorite Artist can now become a tombstone and remain visible through retained My Library queries. Do not otherwise redesign the repository signature in this change.

Accept the current reconciliation scopes for the first implementation. A filtered local result may cause an omitted row to remain active. This is a stale-display defect, not an invalid-object risk. Do not add a second reconciliation query or another repository method unless a focused test proves that resurrection cannot work with the current `queryForModel` behavior.

### 2. Keep current membership and add root-level visibility

Keep the existing `splice()` calls in `relisten/realm/models/show_repo.ts`. An omitted SourceSet or SourceTrack leaves the current parent list but remains a valid Realm row. History, queue, and offline features can still reach retained tracks through their existing direct links, UUIDs, or scalar UUID fields.

Do not turn `Source.sourceSets`, `SourceSet.sourceTracks`, or `Song.shows` into historical membership logs. Do not add parent-UUID validation to every traversal.

Add `deletedAt == nil` to the Realm queries that are the roots of normal catalog browsing:

- Artist browse and search;
- Year, Venue, Tour, and Song lists;
- recent, top, today, and momentum Show lists;
- online Show, Source, SourceSet, and SourceTrack selection;
- CarPlay catalog browsing.

The main query roots are in `relisten/realm/models/artist_repo.ts`, `year_repo.ts`, `venue_repo.ts`, `tour_repo.ts`, `song_repo.ts`, `show_repo.ts`, and `relisten/realm/models/shows/`. CarPlay browse queries are in `relisten/carplay/`. Keep the edits at those existing query factories and route resolvers. Do not introduce a replacement query layer.

Keep these reads retained unless a specific screen only represents the current remote catalog:

- playback history and listening statistics;
- the current queue and queue restoration;
- successful downloads and offline routes;
- favorites and My Library;
- CarPlay history, library, offline, and current queue.

A retained screen may currently reach tracks only through a current membership list. If that list no longer contains the tombstone, add a direct query by the existing scalar UUID fields for that screen. Do not preserve historical membership throughout the database to solve one retained screen.

Apply the predicate to the row being selected. Do not recursively validate its relationships. For example, an active Show may still link to a tombstoned Venue. The Venue remains valid, and showing its old name is acceptable.

Do not add `CatalogVisibility`, active/retained point-read wrappers, access-site strings, Sentry fingerprints, power-of-two breadcrumbs, or proxy objects. Use an unfiltered Realm query when a retained feature needs tombstones. Add a short comment only when the retained choice is not obvious from the feature name.

### 3. Repair legacy missing links before consumers mount

Add one file: `relisten/realm/catalog_startup_repair.ts`.

Export one synchronous function:

```ts
function repairCatalogAtStartup(realm: Realm): CatalogRepairSummary;
```

Keep the repair explicit. Do not build a generic relationship graph.

In one Realm write, repair these known relationships:

- `Show.artist` from `Show.artistUuid`;
- `Source.artist` from `Source.artistUuid`;
- `SourceTrack.artist` from `SourceTrack.artistUuid`;
- `SourceTrack.show` from `SourceTrack.showUuid`;
- `SourceTrack.source` from `SourceTrack.sourceUuid`;
- `SourceTrack.year` from the repaired Show's `yearUuid`.

Only query rows whose required link is `nil`. Use Realm predicates so a healthy database does not materialize every catalog row in JavaScript.

If a required target does not exist:

- set `deletedAt` on the referring Show, Source, or SourceTrack;
- clear `isFavorite` on an irreparable favoritable row;
- remove an irreparable SourceTrack from current `SourceSet.sourceTracks` lists;
- remove an irreparable Show from current `Song.shows` sets;
- remove the SourceTrack UUID from both `PlayerState` queue arrays;
- physically delete `PlaybackHistoryEntry` rows that depend on the irreparable catalog row;
- detach and physically delete `SourceTrackOfflineInfo` rows that depend on it.

History and offline metadata are leaves. Their removal cannot invalidate a catalog object. Perform this cleanup before any history, queue, download, or CarPlay consumer mounts.

Also delete legacy leaf rows that are already malformed:

- a `PlaybackHistoryEntry` with a missing `sourceTrack`, `artist`, `show`, or `source` link;
- a `PlaybackHistoryEntry` whose SourceTrack still has an unrepaired required link;
- a `SourceTrackOfflineInfo` with no SourceTrack backlink.

Do not create placeholder catalog rows to preserve malformed leaf data.

Log one summary after repair. Include counts by model and action. Do not log one event per row. Do not add read-time tombstone diagnostics.

Replace the current `RealmBridge` with a small `RealmStartupGate` inside the React `RealmProvider` in `app/_layout.tsx`. It runs the synchronous repair, sets the shared Realm reference, and only then mounts `RootServicesProvider` and the other consumers.

Call the same repair from `openRealm()` before it stores or returns the opened Realm. The repair is idempotent, so it may run once for each Realm instance without a version flag.

After startup, the existing centralized catalog writers must not publish a row as active when they have left one of the required links above as `nil`. If a writer cannot attach a required target, set `deletedAt` on that row. Do this in the existing relationship-attachment code. Do not add read-time guards throughout the UI.

### 4. Keep leaf deletion physical and make async holders safe

Do not add `deletedAt` to `PlaybackHistoryEntry`, `SourceTrackOfflineInfo`, `LastFmScrobbleEntry`, or `PlayerState`. Do not add a leaf collector.

Keep the current history-clear, download-removal, Last.fm, and PlayerState deletion behavior.

Make the known asynchronous history boundaries safe:

- In `PlaybackHistoryReporter`, copy the history UUID and SourceTrack UUID before the API request. After the request, look up the history row again before setting `publishedAt`. If the user cleared history, there is nothing to update.
- Before the retry loop awaits network work, snapshot the history UUIDs that it plans to publish. Resolve each UUID immediately before use.
- In CarPlay history selection, keep plain UUIDs in the selection map or copy the needed UUIDs before the first `await`. Do not hold a `PlaybackHistoryEntry` across asynchronous work.

Keep the DownloadManager's existing deletion checks and metadata re-fetch. Do not introduce another offline lifecycle in this change.

## Concrete Steps

Run all commands from `/Users/alecgorge/code/relisten/relisten-mobile` with the Node version from `.nvmrc`.

1. Confirm the branch and base:

   ```sh
   nvm use
   git status --short --branch
   git rev-parse HEAD
   git rev-parse origin/main
   ```

   Expected branch: `codex/permanent-catalog-tombstones`. The implementation base is `origin/main` at `7c1b74d`.

2. Add a small Vitest harness with real Realm. Keep tests close to the Realm lifecycle modules. Run Realm tests in one worker and call `Realm.shutdown()` after the suite.

3. Implement repository tombstones and resurrection. Run the focused repository tests.

4. Add active root predicates. Verify each changed query against its route: current catalog routes are active; history, queue, offline, and My Library routes are retained.

5. Add startup repair and the history async fixes. Run the repair and reporter tests.

6. Run the full checks:

   ```sh
   yarn test
   yarn lint
   yarn ts:check
   ```

7. Audit physical Realm deletion:

   ```sh
   rg -n "realm\.delete|deleteAll\(" app relisten
   ```

   Expected result: no catalog model is deleted. Physical deletion remains only for leaf or singleton data.

8. Review only the changed files. Remove duplicate helpers, forwarding wrappers, speculative options, and comments that restate the code. Do not expand scope during this pass.

## Validation and Acceptance

Use real Realm tests for these behaviors:

1. A version 12 Realm opens at version 13. Existing catalog rows have `deletedAt == nil`.
2. An authoritative omission sets `deletedAt` and leaves a held managed catalog object valid.
3. Tombstoning a SourceTrack preserves its direct Artist, Year, Show, and Source links.
4. Current membership replacement may remove the SourceTrack from `SourceSet.sourceTracks` without invalidating the SourceTrack.
5. A same-timestamp API response clears `deletedAt` and reuses the same primary-key row.
6. A merge-only `upsertMultiple()` call does not tombstone omitted rows.
7. A normal browse query hides a tombstone. A history or queue lookup can still return it.
8. Startup repair restores each known missing link when the target row exists.
9. Startup repair tombstones an irreparable catalog row and removes its history, offline, favorite, membership, and queue entry points.
10. Running startup repair twice produces no further changes on the second run.
11. Clearing history during an in-flight report does not access the deleted history object after the request completes.

Run these manual scenarios on the iPhone 17 simulator:

- Start playback. Refresh the full Show so the current SourceTrack is omitted. Confirm playback and queue rendering continue.
- Restore a queue that contains a tombstoned SourceTrack. Confirm the track remains playable when its media is available.
- Confirm normal Artist and Show browsing hides tombstones.
- Confirm history and My Library can render a structurally valid tombstone.
- Open a copied Realm with a repairable missing link. Confirm startup repairs the link before the first screen mounts.
- Open a copied Realm with an irreparable SourceTrack. Confirm the app removes its leaf and queue entry points and does not crash.
- Clear history while a report request is in flight. Confirm the request completion does not throw an invalid-object error.

Acceptance requires `yarn test`, `yarn lint`, and `yarn ts:check` to pass. The final deletion audit must show no catalog `realm.delete()` call.

## Idempotence and Recovery

Setting `deletedAt` is idempotent. Repeated omissions keep the original date.

Positive API data clears `deletedAt`. A false tombstone can therefore recover without creating a second primary-key row.

Startup repair is idempotent. A restored row no longer matches its missing-link query. An irreparable catalog row remains a valid tombstone, and its leaf references are already gone.

Schema version 13 is one-way. Ship the change in a native runtime whose embedded bundle also uses schema version 13. A rollback bundle for that runtime must keep schema version 13 and the nine `deletedAt` properties.

Do not use `deleteRealmIfMigrationNeeded` as recovery. It would delete local history, downloads, settings, and queue state.

## Artifacts and Notes

Keep these artifacts with the implementation:

- focused real-Realm test output;
- `yarn lint` and `yarn ts:check` output;
- the final `realm.delete` audit;
- a short manual record for playback, queue restoration, startup repair, retained history, and in-flight history clear.

Repository checkpoint evidence from Node 22.21.1:

    Test Files  1 passed (1)
         Tests  4 passed (4)
    yarn ts:check: passed
    focused ESLint: passed

## Interfaces and Dependencies

Do not add a catalog lifecycle service or a general read API.

The existing repository interface remains the write interface:

```ts
class Repository<...> {
  upsert(...): UpsertResults<...>;
  upsertMultiple(
    realm,
    apiRows,
    localRows,
    performDeletes,
    queryForModel,
    shouldPreserve?
  ): UpsertResults<...>;
}
```

The only new runtime interface is the startup repair:

```ts
interface CatalogRepairSummary {
  repairedLinks: number;
  tombstonedRows: number;
  deletedLeafRows: number;
  removedQueueEntries: number;
}

function repairCatalogAtStartup(realm: Realm): CatalogRepairSummary;
```

Add only one development dependency: Vitest. Do not add a runtime dependency.

Plan revision note, 2026-08-21: implementation started after the user approved the simplified design. The recorded base commit was updated to the current `origin/main`; the lifecycle design did not change.

Plan revision note, 2026-08-21 01:22Z: the schema and repository milestone is complete. Real Realm tests now prove tombstoning, stable links, same-timestamp resurrection, merge-only behavior, and the additive schema migration.
