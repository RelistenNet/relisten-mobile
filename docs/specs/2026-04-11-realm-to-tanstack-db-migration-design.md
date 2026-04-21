# Realm → TanStack DB Migration Design

**Date:** 2026-04-11
**Status:** Draft v1
**Related:** `/Users/alecgorge/code/relisten/RelistenApi/docs/design/2026-04-11-relisten-playlists-user-accounts-design.md` (user-accounts & playlists spec, lists this migration as a prerequisite)
**Supersedes:** `docs/specs/2026-04-12-realm-to-tanstack-db-migration.md` (earlier draft kept for history)

## Overview

Migrate Relisten Mobile off Realm (no longer maintained upstream) and onto a local SQLite-backed TanStack DB data layer. This spec is **only** about eliminating Realm as a dependency and unblocking the user-accounts work referenced above. It does not design server sync, favorites sync, or the final server-side user-data model — those live in the user-accounts spec.

The migration must:

- Preserve today's reactivity guarantees. Screens that update live when data changes must continue to.
- Preserve freshness and performance. Catalog fetches must keep their etag-aware stale-while-revalidate behavior; write-path latency for user-data mutations must stay low.
- Preserve offline guarantees. Downloaded tracks must remain playable through the migration — including the full catalog breadcrumb (`Artist → Year → Show → Source → SourceSet → SourceTrack`) each downloaded track depends on.
- Be safe for tens of thousands of existing installs. One-shot migration on upgrade, transactional, with a rollback window.

### Goals

- Replace Realm with SQLite as persistent storage and TanStack DB collections as the reactive/query layer.
- Preserve the `NetworkBackedBehavior` pattern and etag cache.
- Centralize all writes through a typed repository. Make bypass mechanically impossible or caught at boot in dev.
- Provide a safe one-shot migration path for every existing install, covering both user data and the full catalog cache.
- Lay the client-side groundwork for the user-accounts spec: a `collections.ts` / `queries.ts` split, React-agnostic subscriptions, and a centralized mutation surface that an offline outbox can later plug into.

### Non-goals (explicit, to keep scope tight)

- No user accounts, auth, playlists, or any server sync. Those are the user-accounts spec.
- No changes to the Relisten API surface. Same endpoints, same shapes.
- No rewrite of the native audio player module. Only its JS-side references to Realm change.
- No introduction of TanStack Query as a replacement fetcher. The existing `wretch` client is unchanged.
- No on-device separation of catalog DB from user DB. One SQLite file; conceptual separation only.
- No encryption of the local SQLite file (matches current Realm behavior; additive later).
- No final decisions about where favorites/history/settings live server-side. Those belong to the user-accounts spec. This spec only consolidates favorites into a single local table as a targeted improvement (see §2).

---

## 1. Architecture

Replace Realm with SQLite as the persistent store and TanStack DB as the reactive/query layer. Everything else (API client, `NetworkBackedBehavior` policies, UI components, audio player module) stays conceptually in place with imports and hooks rewired.

### 1.1 Layers, bottom to top

1. **SQLite (persistent storage).** One file, WAL mode, JSI driver (`op-sqlite` or `expo-sqlite` — chosen per benchmark, see §9). Holds every catalog table, every user/mutable table, and the `url_request_metadata` etag table. Single source of truth for data on disk.

2. **Repository (`relisten/db/repository.ts`).** Typed per-table writers, a `transaction` API, one `rawWrite` escape hatch. Sole gateway to SQLite. Emits invalidation events to the collection layer on every commit. Ports the role of today's `relisten/realm/repository.ts`.

3. **Collection layer (`relisten/db/collections.ts`, `relisten/db/queries.ts`).**
   - `collections.ts` instantiates **long-lived singletons** for small, always-on data (favorites, offline info, player state, user settings, derived library membership, remaining downloads).
   - `queries.ts` exposes **factories** for parameterized catalog queries (`showsForArtist(uuid)`, `tracksForSource(uuid)`, etc.). A registry keys collections by `(factoryName, params)`; identical params return the same instance. Ref-counted subscribers; 30s TTL after last unsubscribe.
   - Each collection is backed by SQL. On first subscription, runs the SELECT and materializes rows into TanStack DB's collection state. On invalidation, applies a row-level delta (hot paths) or re-runs the SELECT (safe default).
   - All collections are **plain TypeScript objects** with `.subscribe(cb) → unsubscribe` and `.state`. The React hook `useLiveQuery(collection)` is a `useSyncExternalStore` wrapper. Matches the data layer in the user-accounts spec and supports CarPlay, DownloadManager, and background tasks as first-class consumers.

4. **NetworkBackedBehavior (preserved, retargeted).** Stays as a policy class: `shouldPerformNetworkRequest`, `fetchStrategy` (`NetworkAlwaysFirst` / `StaleWhileRevalidate` / `LocalOnly` / `NetworkOnlyIfLocalIsNotShowable`), `upsert` on success. Its "local data" side reads from a TanStack DB collection instead of Realm `Results`. Its upsert side calls the repository instead of `realm.write`. Etag freshness continues to use `url_request_metadata`.

5. **UI / React.** `useLiveQuery(collection)` replaces `useQuery(RealmModel)`. `useObject(RealmModel, pk)` becomes `useLiveQuery(byUuid(uuid))`. No `RealmProvider`; collections are imported directly.

### 1.2 Read-path data flow

```
Screen mount
  → useLiveQuery(showsForArtist(uuid))
  → collection factory returns registry hit OR creates new collection
  → collection runs SELECT on SQLite, materializes rows
  → NetworkBackedBehavior checks url_request_metadata → decides fetch
  → if fetch → API → repository.upsertMultiple(...)
                      → SQLite transaction commits
                      → emits table invalidation
                      → affected collections re-query (or apply delta)
                      → subscribers re-render
```

### 1.3 Write-path data flow (user data)

```
User toggles favorite
  → repository.favorites.upsert({...})
  → SQLite transaction commits (single row)
  → WriteSet emitted: { tables: ['favorites'], deltas: [{insert, ...}] }
  → favorites collection applies delta directly (no re-query)
  → any collection joining favorites recomputes via TanStack DB differential dataflow
  → subscribers re-render
```

### 1.4 What is not in this layer

The audio player native module, DownloadManager's file I/O, and offline file storage on disk are untouched. They reference the DB only via the repository and collection API — same shape as today.

---

## 2. Schema Translation

### 2.1 Mapping rules

| Realm construct | SQLite equivalent |
|---|---|
| `uuid: string` primary key | `uuid TEXT PRIMARY KEY` |
| Indexed scalar field | `CREATE INDEX idx_{table}_{col} ON {table}({col})` |
| `Realm.List<T>` (ordered) | FK on child table pointing to parent + an existing position column (e.g., `track_position`); child reads via `SELECT * FROM child WHERE parent_uuid = ? ORDER BY {position}` |
| `linkingObjects` / `@BackLink` | Not stored. Reverse `SELECT`, backed by the FK's index. E.g., `Artist.sourceTracks` → `SELECT * FROM source_tracks WHERE artist_uuid = ?` |
| `Realm.Set<T>` (many-to-many) | Junction table `{a}_{b}(a_uuid, b_uuid)` with composite PK and indexes on both columns |
| Embedded object | **JSON blob + stored generated columns for fields actually queried.** See §2.3 |
| JSON-serialized string (`features`, `links`, `upstreamSources`) | `TEXT` column; parsed in model layer (unchanged pattern) |
| Enum (`FlacType`, `OfflineStatus`, `PlaybackFlags`, `QueueShuffleState`) | `INTEGER`, with TS enum mapping. Bitflags stay `INTEGER` — bitwise ops in SQL still work |
| `Date` | `INTEGER` (Unix ms). Faster comparison, indexing, sort than TEXT dates |
| `boolean` | `INTEGER` (0/1) |
| Sentinel-key singleton (`PlayerState`, `UserSettings`, `LastFmSettings`) | Single-row table with `CHECK (id = '...sentinel...')` constraint |

### 2.2 Rule of thumb — flat columns vs JSON-backed

| Case | Storage |
|---|---|
| Scalar on the parent entity (`artist.name`, `show.date`) | Flat column |
| Embedded struct owned by the parent (`Popularity`, nested window data, future embedded metadata) | JSON blob + generated columns for fields actually queried |
| Array-shaped embedded list (`features: string[]`, `upstream_sources`) | JSON blob only, parsed in TS (unchanged) |
| Relationship (1:N, N:M) | FK / junction table |

### 2.3 Embedded objects: strong story

The app has embedded objects today (`Popularity`, with nested `PopularityWindows` / `PopularityWindow`) that are accessed both opaquely (display) and queryably (sort by momentum). Flattening to N columns is rigid; pure JSON loses queryability.

**Pattern:** store embedded objects as JSON TEXT. For fields that sort/filter drives, add SQLite **stored generated columns** that extract via `json_extract` at write time:

```sql
popularity TEXT,
popularity_momentum_score REAL GENERATED ALWAYS AS
    (json_extract(popularity, '$.momentumScore')) STORED,
popularity_trend_ratio    REAL GENERATED ALWAYS AS
    (json_extract(popularity, '$.trendRatio')) STORED,
CREATE INDEX idx_artists_momentum ON artists(popularity_momentum_score);
```

Stored generated columns materialize once on write, zero read overhead, fully indexable — identical query performance to regular columns. Other fields in the blob stay opaque, accessed on demand via `json_extract` or parsed TS-side once.

Shape evolution is cheap: adding a new popularity metric is a TS parser change; if it needs sorting, one generated column via migration.

Both `op-sqlite` and `expo-sqlite` ship SQLite ≥ 3.38, which supports stored generated columns.

### 2.4 Tricky translations

- **`SourceSet.sourceTracks: Realm.List<SourceTrack>`** → `source_tracks.source_set_uuid` FK + existing `source_tracks.track_position`. Composite index `(source_set_uuid, track_position)`.
- **`Song.shows ↔ Show.songs: Realm.Set<>`** → `song_shows(song_uuid, show_uuid)` with both indexes. Migration walks each `Song.shows` relation once.
- **`linkingObjects`** hot paths (`Artist.sourceTracks`, `Show.sourceTracks`, `Source.sourceTracks`) need composite indexes: `(artist_uuid)`, `(show_uuid, source_uuid)`, `(source_uuid, track_position)` on `source_tracks`.
- **`Popularity` embedded** → see §2.3.
- **Sentinel singletons** → one-row tables. The collection layer exposes them as a single-object live query, not a list.
- **`SUBQUERY(sourceTracks, $item, $item.offlineInfo.status == Succeeded).@count > 0`** (current "shows with any offline track" filter) → SQL `EXISTS` join against `source_track_offline_info`. Index on `source_track_offline_info.status` keeps this cheap.
- **`UrlRequestMetadata`** ports directly: `url TEXT PRIMARY KEY, etag TEXT, last_request_completed_at INTEGER`. Critical to preserve through migration — otherwise every screen re-fetches on first post-migration visit.

### 2.5 Indexing

- Port every Realm `indexed: true` field directly.
- Add composite indexes for every foreign-key traversal backing a `linkingObjects` or a current `SUBQUERY` predicate.
- Date columns that drive sort (`shows.date`, `playback_history.playback_started_at`) indexed individually.

### 2.6 SQLite schema versioning

- `PRAGMA user_version`. Separate from Realm's `schemaVersion=12`. Starts at 1.
- Schema changes post-v1 ship via forward-only migrations (`001_init.sql`, `002_add_column.sql`, …) run inside the repository's bootstrap. No ad-hoc `ALTER` in application code.

### 2.7 Table inventory

**Catalog:** `artists`, `years`, `venues`, `tours`, `shows`, `sources`, `source_sets`, `source_tracks`, `songs`, `song_shows` (junction), `url_request_metadata`.

**User / mutable:** `favorites`, `source_track_offline_info`, `playback_history`, `player_state`, `user_settings`, `lastfm_settings`, `lastfm_scrobble_entries`, `route_filter_config`, `migration_state`.

### 2.8 Targeted cleanup — favorites

Today, favorites are a boolean `isFavorite` on each catalog model (`Artist`, `Show`, `Source`, `Tour`, `Song`, `SourceTrack`) — six write paths, mixing user state with catalog cache. This is the exact confusion the user-accounts spec unwinds.

As part of this migration: favorites become a single `favorites(entity_type TEXT, entity_uuid TEXT, created_at INTEGER, PRIMARY KEY (entity_type, entity_uuid))` table. The `isFavorite` column drops off every catalog model. UI "is X favorited?" reads a join/lookup against the always-in-memory `favorites` collection.

This is in scope because it matches the user-accounts spec's shape exactly and directly unblocks it. Everything else in the schema is 1:1 with Realm.

---

## 3. Collection Layer & Reactivity

### 3.1 Collection shapes

Three distinct shapes, each picked for a specific kind of data.

**(1) Long-lived base collections** (`relisten/db/collections.ts`): small, always-on, user/UI-critical tables. Instantiated at app boot, never disposed.

- `favorites`, `offlineInfo`, `remainingDownloads` (derived filter over `offlineInfo`)
- `userSettings`, `playerState`, `lastFmSettings` (single-row sentinels)

**(2) Derived keyed indexes** (`relisten/db/indexes.ts`): always-on materialized aggregates with O(1) keyed lookup and keyed per-subscriber invalidation. **These are the direct replacement for today's `LibraryIndex`** — see §3.6. Kept as a first-class collection kind because hot lists need synchronous per-row lookups without fanning out to SQL or re-diffing a whole list on every row change.

**(3) Factory-made parameterized collections** (`relisten/db/queries.ts`): catalog queries keyed by params, ref-counted, TTL-evicted.

```ts
export const showsForArtist = collectionFactory(
  'showsForArtist',
  (artistUuid: string) => ({
    tables: ['shows', 'source_tracks', 'source_track_offline_info'],
    load: (db) => db.all(
      'SELECT * FROM shows WHERE artist_uuid = ? ORDER BY date DESC',
      [artistUuid]
    ),
    getKey: (row) => row.uuid,
    applyDelta: undefined, // optional; see §3.5
  })
);
```

Registry key: `(factoryName, JSON.stringify(params))`. Ref-counted on subscribe/unsubscribe; 30s TTL after last unsubscribe then disposed (freed from registry, prepared statement released).

### 3.2 Why the reactivity bridge can't be simpler

TanStack DB gives automatic propagation *once a change lands in a collection*: differential dataflow recomputes derived live queries, joins, and subscribers for free. That part is real and we lean on it.

What TanStack DB can't do for us is close the gap between **external-store writes (SQLite) and narrow-slice collections.** We chose per-screen SQL-backed collections (not one giant in-memory collection) because the catalog is too large for the heap: 100k+ shows cannot be held in a single collection on a mobile device. That forces three realities:

1. Writes happen at the **table level** (a catalog upsert writes 6 tables atomically). No single collection owns a multi-table write.
2. A row's **membership in a collection can change**. A new phish show INSERT should enter `showsForArtist('phish')`'s state. TanStack DB has no way to know an external SQLite write matched a collection's predicate — it didn't see the write.
3. **Derived state crosses tables.** "Shows with any offline track" depends on `source_tracks` + `source_track_offline_info`; a write to one nudges the derived view.

A reactivity bridge exists only to feed external-store writes into collection state. Once state is updated, everything downstream is TanStack DB's automatic propagation. We're not building a parallel reactivity system; we're feeding the one TanStack DB already has.

This is the documented pattern for TanStack DB's external-source collections. The built-in `QueryCollection` (backed by TanStack Query) uses `invalidateQueries` as its bridge. Ours is the same shape, pointed at SQLite.

### 3.3 Write invalidation protocol

All writes go through the repository. No direct SQLite mutation from application code. The repository:

1. Opens a transaction.
2. Applies writes; collects a `WriteSet { tables: Set<string>, deltas: RowDelta[] }`. `deltas` are `{ table, op: 'insert' | 'update' | 'delete', row | rowid }`.
3. Commits.
4. Emits the `WriteSet` to a central event bus on the next microtask.

Each active collection subscribes to the bus. On event:
- If `collection.tables ∩ writeSet.tables = ∅` → ignore.
- Else if `applyDelta` exists and the delta shape fits → apply directly, no re-query.
- Else → re-run `load(db)` and diff against current state. TanStack DB computes the minimal change set.

### 3.4 Why not `update_hook` as the event source

SQLite's `update_hook` fires per-row *during* a transaction and doesn't know about logical batches. A 500-row upsert becomes 500 invalidations, and each collection would re-query 500 times. The repository-owned bus collapses that to one event per commit.

`update_hook` is repurposed as a **dev-mode tripwire** (§3.7).

### 3.5 Row-level deltas vs re-query

`applyDelta` is optional. Collections without it always re-run `load` on invalidation — slightly more expensive, always correct. `applyDelta` is written only for the always-on hot paths (`favorites`, `offlineInfo`, `playerState`, `userSettings`) where the per-row delta is trivial (the delta row either is or isn't in the collection's result set; no joins to re-evaluate). Catalog collections with joins/filters/ordering don't implement `applyDelta` — re-query is the safe default.

### 3.6 Derived keyed indexes (replacement for `LibraryIndex`)

Today's `LibraryIndex` is a **performance contract**, not a missing feature of Realm. It provides:

- **Keyed subscriptions** by artist / year / show / source UUID — a consumer subscribes for one key and is only notified when *that key's* value changes.
- **Aggregated membership**, where an artist is "in library" if *any* of its shows, sources, or source_tracks is favorited or offline — i.e., aggregation across a relationship, not a simple join.
- **Per-parent counts** — e.g., "how many offline tracks does this show have?" — which drive list rendering without re-scanning child rows per list item.
- **O(1) lookup in hot lists** — an artist list rendering hundreds of rows asks `isInLibrary(uuid)` once per row. That must not be a SQL call, a full-collection filter, or a join recompute per row.

Simple joins over `favorites` and `offlineInfo` (e.g., `artist LEFT JOIN favorites`) handle the trivial "is this artist directly favorited?" case but do **not** replace aggregated membership, per-parent counts, or keyed invalidation. TanStack DB's live queries recompute efficiently across the whole result set but still require the consumer to filter down to "my row" — wrong shape for hot per-row lookups.

**The replacement is a named collection kind:** derived keyed indexes. Each index is:

- Always-on, materialized once at boot, maintained incrementally as inputs change.
- Built by composing base collections (`favorites`, `offlineInfo`, plus minimal catalog relationship tables where aggregation is needed) via TanStack DB live queries.
- Exposed through a small API: `index.get(key)`, `index.subscribe(key, cb)`, `index.has(key)`. Keyed subscriptions fire only when that specific key's value changes — differential dataflow at the index level, not the list level.

**Concrete indexes to preserve the current performance contract:**

| Index | Key | Value | Replaces in LibraryIndex |
|---|---|---|---|
| `libraryMembership` | `(entity_type, entity_uuid)` | boolean | `isInLibrary(uuid)` lookups for any entity type |
| `offlineTrackCountByShow` | `show_uuid` | integer | show rows that render "N offline" badges |
| `offlineTrackCountBySource` | `source_uuid` | integer | source rows that render "N offline" badges |
| `offlineAvailabilityByArtist` | `artist_uuid` | boolean | "artist has any offline content" |
| `offlineAvailabilityByYear` | `(artist_uuid, year_uuid)` | boolean | "year has any offline content" |
| `favoriteCountsByArtist` | `artist_uuid` | `{ shows, sources, tracks }` | fan-out from favorite aggregations |

These are computed from `favorites` + `offlineInfo` joined against the relevant catalog parent-key columns (`source_tracks.artist_uuid`, `source_tracks.show_uuid`, etc.). The aggregation doesn't require the full catalog collection to be in memory — only the columns needed for the join, which for these indexes is a small projection.

**Keyed invalidation** works because each index tracks which keys' values changed on each input update. The WriteSet from a repository commit tells us which tables changed (see §3.3); each index recomputes only for the keys it knows are affected by those tables. A consumer subscribed to `libraryMembership.subscribe('show', 'abc-123', cb)` is notified only when that specific show's membership value changes.

**Hot-list usage pattern:**

```ts
// In a list row component
const isInLibrary = useIndexValue(libraryMembership, ['show', show.uuid]);
```

`useIndexValue` is a `useSyncExternalStore` over `index.subscribe(key, cb)`. Per-row cost is a hash lookup + keyed subscription — the same cost as the current `LibraryIndex` contract.

**Writing indexes correctly is the non-trivial part of this migration.** Each index gets its own test suite asserting:
- Initial value correctness across seeded data.
- Keyed subscription fires on the target key and not on unrelated keys.
- Aggregate correctness across relationship edges (adding an offline track on a show flips `offlineAvailabilityByArtist` for the show's artist if and only if this was the artist's first offline content).

For catalog-facing "is X favorited?" questions that aren't in a hot list, simple joins against `favorites` are still the right tool — e.g., on a detail screen, `useLiveQuery(artistWithFavoriteStatus(uuid))`. Indexes exist for the list-render contract specifically.

### 3.7 Correctness guardrails

Invalidation protocols are easy to get silently wrong. The following make each failure mode mechanical:

1. **Single choke point, enforced by lint.** All SQLite access goes through `relisten/db/repository.ts`. ESLint `no-restricted-imports` bans importing the SQLite handle from anywhere else.
2. **Affected tables derived, not declared.** Repository exposes typed per-table methods (`repository.favorites.upsert(...)`). Each method knows its table by construction — invalidation is automatic. No `affectedTables: [...]` argument to forget. Raw-SQL writes (rare) go through `repository.rawWrite(sql, params, tables)` with explicit table list; dev-mode validates.
3. **`update_hook` as a dev-mode tripwire.** Cross-checks every `update_hook` fire against the repository's emitted `WriteSet`. Bypass (write outside repository) or declaration drift (missing table) throws loudly with offending SQL. Controlled by env flag `RELISTEN_DB_TRIPWIRE=1`; on by default in dev, toggleable off for perf-sensitive local work (bulk imports, profiling). Off in production (measurable overhead).
4. **Declared `tables` verified against the SQL.** At collection definition time (module load, dev only), run `EXPLAIN QUERY PLAN` on the `load` SQL, extract tables actually read, assert match with declared `tables`. Fails at boot in dev, not silently at runtime. Production skips the check.
5. **`applyDelta` is opt-in; default is safe.** Collections without `applyDelta` re-query on every invalidation. Always correct. `applyDelta` is only written for small, obvious cases.
6. **Reactivity integration tests.** A small harness mounts a collection, runs a write through the repository, asserts the collection updated. ~20 focused tests in CI covering every long-lived collection and a few catalog factories. A new write method that doesn't wire into the event path will fail the suite.
7. **Small write surface.** `NetworkBackedBehavior` is the write source for 90% of catalog writes. User-data writes are similarly centralized (favorites toggle, offline state, player state, history). Total call-site count is under ~50 across the app.

### 3.8 React and non-React consumers

- `useLiveQuery(collection)` is a thin `useSyncExternalStore` wrapper.
- Non-React consumers (DownloadManager, CarPlay, scrobbler, background tasks) use `collection.subscribe(cb) → unsubscribe` directly.
- Same collection instance shared across all consumers.

### 3.9 Startup sequence

1. Open SQLite, run schema migrations (`PRAGMA user_version`).
2. Check migration marker. If Realm data not yet migrated, run migration (§5).
3. Instantiate base collections (§3.1.1). Each runs its `load` once.
4. Materialize derived keyed indexes (§3.1.2) from base collections. Indexes compute their initial state in one pass over their inputs.
5. Budget for steps 3–4 combined: ≤50ms on mid-tier device.
6. Render app. Factory-made collections created lazily on first `useLiveQuery`.

### 3.10 Memory bounds

Long-lived collections: small by construction (favorites, offline info, singletons, library membership — thousands of rows max, typically). Factory-made: bounded result sets (single artist's shows, single source's tracks). Registry holds at most a few hundred entries in an active session; TTL eviction keeps it flat.

---

## 4. Repository & NetworkBackedBehavior

### 4.1 Repository shape

Single gateway to SQLite. Typed per-table writers. One `transaction` API. One raw-SQL escape hatch.

```ts
class Repository {
  // Catalog
  readonly artists     : TableWriter<Artist>;
  readonly years       : TableWriter<Year>;
  readonly shows       : TableWriter<Show>;
  readonly sources     : TableWriter<Source>;
  readonly sourceSets  : TableWriter<SourceSet>;
  readonly sourceTracks: TableWriter<SourceTrack>;
  readonly venues      : TableWriter<Venue>;
  readonly tours       : TableWriter<Tour>;
  readonly songs       : TableWriter<Song>;
  readonly songShows   : JunctionWriter<'song_uuid', 'show_uuid'>;

  // User / mutable
  readonly favorites         : TableWriter<Favorite>;
  readonly offlineInfo       : TableWriter<SourceTrackOfflineInfo>;
  readonly playbackHistory   : TableWriter<PlaybackHistoryEntry>;
  readonly playerState       : SingletonWriter<PlayerState>;
  readonly userSettings      : SingletonWriter<UserSettings>;
  readonly lastFmSettings    : SingletonWriter<LastFmSettings>;
  readonly lastFmScrobbles   : TableWriter<LastFmScrobbleEntry>;
  readonly routeFilterConfig : TableWriter<RouteFilterConfig>;
  readonly urlRequestMetadata: TableWriter<UrlRequestMetadata>;

  transaction<T>(fn: (tx: RepositoryTx) => T): T;
  rawWrite(sql: string, params: unknown[], affectedTables: string[]): void;
  read<T>(sql: string, params: unknown[]): T[];
}
```

```ts
interface TableWriter<T> {
  // writes — emit invalidation on commit
  upsert(row: T): void;
  upsertMany(rows: T[]): void;
  update(key: string, patch: Partial<T>): void;
  delete(key: string): void;
  deleteMany(keys: string[]): void;

  // reads — for diff-and-upsert flows inside a transaction
  get(key: string): T | undefined;
  getAllById(keys: string[]): T[];
}
```

Internally: prepared statements (cached per writer), JSI batch binding inside a transaction. `upsertMany` wraps N rows in an implicit transaction, one prepared statement, one commit, one invalidation event.

### 4.2 Transaction semantics

- All writers inside `repository.transaction(tx => ...)` share one SQLite transaction. One invalidation event at commit, listing all tables written.
- A writer called outside `transaction()` opens an implicit single-statement transaction and commits immediately.
- Nested: only outermost commits; inner ones are savepoints.
- Throw inside → full rollback. No invalidation emitted.

### 4.3 Repo contract mapping

Today's Realm `Repository<TModel, TApi, ...>` ownership:

- `propertiesFromApi(apiRow) → row` and `relationshipsFromApi(apiRow)` stay as static methods on each model class. Pure functions.
- `shouldUpdateFromApi(existing, incoming)` stays as a model-level predicate. Called inside `upsertMany`'s diff logic.
- `upsertMultiple(apiRows)` becomes a per-model-module function (`artist_repo.ts`, etc.):

```ts
export function upsertArtists(apiRows: ApiArtist[]) {
  repository.transaction(tx => {
    const incoming = apiRows.map(Artist.propertiesFromApi);
    const existing = tx.artists.getAllById(incoming.map(r => r.uuid));
    const diff = computeDiff(existing, incoming);
    tx.artists.upsertMany(diff.upserts);
    tx.artists.deleteMany(diff.removed);
    for (const r of diff.upserts) {
      const rels = Artist.relationshipsFromApi?.(r);
      if (rels?.songShows) tx.songShows.replaceForParent(r.uuid, rels.songShows);
    }
  });
}
```

Existing `_repo.ts` files stay in place, rewired to this API. Their `NetworkBackedBehavior` wrappers carry over.

### 4.4 NetworkBackedBehavior

Kept as-is conceptually. Three implementations port one-for-one:
- `NetworkBackedModelArrayBehavior<T, TApi>` — list, backed by a factory collection.
- `NetworkBackedModelBehavior<T, TApi>` — single entity, backed by a `byUuid` collection factory.
- `ThrottledNetworkBackedBehavior` — wraps either, adds throttle.

Fetch strategies (`NetworkAlwaysFirst`, `StaleWhileRevalidate`, `LocalOnly`, `NetworkOnlyIfLocalIsNotShowable`) unchanged. Kept as a policy class because those knobs don't map cleanly to TanStack DB's built-in `queryCollectionOptions`.

### 4.5 Etag + freshness

`url_request_metadata` ports directly: same table, same semantics, same write site (API client updates on every response). `shouldPerformNetworkRequest` compares `last_request_completed_at` + `etag` against staleness thresholds.

**One improvement:** the etag write happens inside the same transaction as the upserts that use the response. Today they're two separate Realm writes, and there's a window where etag can be persisted without data (or vice versa) after a crash. Folding both into one transaction closes that race.

### 4.6 NetworkBackedBehaviorExecutor

State machine stays: `isNetworkLoading`, `localData`, `error`, fetch strategy enum. Subscribes to the local collection (not a Realm query) and emits to its own value stream for UI consumers. `RealmQueryValueStream` becomes `CollectionValueStream` with the same surface. `EmittableValueStream` / `CombinedValueStream` stay — they're useful independent of Realm.

### 4.7 Write performance targets

- Batch upsert (100–500 rows from a catalog fetch): **≤50ms** end-to-end on mid-tier device inside one transaction.
- Single user-data write (favorite toggle, progress update): **≤5ms**, including commit + invalidation dispatch.
- Migration path: separate budget in §5.

Prepared-statement caching and JSI batch binding are load-bearing. Both candidate drivers support them.

---

## 5. Migration Mechanics

### 5.1 Preconditions at v1 launch

v1 ships with **both code paths compiled in**, selected by a single boot-time check:

```ts
if (migrationMarkerExists()) {
  // SQLite / TanStack DB path
} else if (remoteGate.enabled) {
  runMigration();  // blocking; see below
  // then SQLite path
} else {
  // Realm path (original code, unchanged)
}
```

This gives a real kill switch: if migrations start failing for a slice of users, flip the remote gate `false` and unmigrated users continue running on Realm. Already-migrated users keep working on SQLite — successful migrations are never reversed. The bifurcation is temporary; removed in v2.

### 5.2 Phase order (single transaction)

```
Preflight (outside transaction)
  1. Remote gate enabled for this device?
  2. Realm file present and schemaVersion == 12?
  3. Available disk space ≥ 1.5 × Realm file size?
  4. SQLite opens, WAL mode set, schema v1 applied?
  5. Any failure → abort cleanly, emit diagnostic, fall through to Realm path

Transaction begin
  6. Copy catalog (parent-first):
       artists → years → venues → tours
              → shows → sources → source_sets → source_tracks
              → songs → song_shows (junction)
  7. Copy user data:
       favorites (derived from isFavorite across catalog models — see 5.4)
       source_track_offline_info
       playback_history
       player_state, user_settings, lastfm_settings (singletons)
       lastfm_scrobble_entries
       route_filter_config
  8. Copy url_request_metadata (etag preservation)
  9. Integrity checks (§5.5)
 10. Write migration_state row { version: 1, completed_at: now }
Transaction commit
```

A failure anywhere between `Transaction begin` and `Transaction commit` rolls back everything. The marker row exists only if every step succeeded. Partial migration is impossible.

### 5.3 Reading from Realm

- Open Realm read-only with existing schema. Never write to Realm during migration.
- Iterate each model with `realm.objects(T)` (lazy — memory stays flat).
- Per row: pure `toSqliteRow(realmObj) → SqliteRow` function. Enum normalization, date → Unix ms, boolean → 0/1, embedded Popularity → JSON string + generated columns populated automatically at INSERT time.
- Relationships:
  - `Realm.List` → child rows with existing position field, batched.
  - `Realm.Set` (`Song.shows ↔ Show.songs` only) → `song_shows` junction rows.
  - `linkingObjects` → not migrated; reconstructed implicitly by indexes.
- Batch size: 1000 rows per prepared-statement execution. JSI bind + step loop.

### 5.4 Deriving favorites

```
For each catalog model T with isFavorite column:
  SELECT uuid, updated_at FROM T WHERE isFavorite = true
  → INSERT INTO favorites (entity_type, entity_uuid, created_at = updated_at ?? now)
```

The catalog SQLite schema does **not** include `is_favorite` columns. Favorites live only in `favorites` post-migration.

### 5.5 Integrity checks (inside transaction, before commit)

- **Row-count parity.** Each catalog + user table's row count matches Realm's count exactly.
- **Offline breadcrumb integrity.** For every `source_track_offline_info` row with `status = Succeeded`, the full chain `source_track → source_set → source → show → year → artist` exists in SQLite. Single EXISTS join. Load-bearing: "downloaded tracks must stay playable" is the reason we migrate the full catalog and not just reachable rows.
- **Favorite parity.** Total favorites = sum of `isFavorite=true` across catalog models.
- **Singleton cardinality.** At most one row each in `player_state`, `user_settings`, and `lastfm_settings`. Zero is valid for all three — today's `PlayerState.defaultObject()` can return null (no queued playback), `UserSettings` is lazily created on first settings access, and `lastfm_settings` only exists after a successful auth. The migration does **not** synthetically seed missing sentinels; absence on disk means absence after migration. The `CHECK (id = '...sentinel...')` constraint on each singleton table prevents more than one row existing; the integrity check verifies `COUNT(*) ≤ 1` for each.

Any check failure → throw → transaction rolls back → retry next launch.

### 5.6 Progress reporting and UI

- Migration emits `MigrationProgress { phase, current, total, message }` during execution. Phases weighted: catalog ~70%, user data ~20%, finalize ~10%; catalog sub-weights proportional to Realm row count per table.
- **Migration screen:** full-screen modal with progress bar, phase label ("Migrating 100,000 tracks…"), reassuring copy, **no cancel button**. Cancellation = corrupt-state risk we avoid.
- **Copy.** Below the progress bar, a single subtle line: *"Please keep Relisten open while we upgrade your library. This only takes a few seconds."* No modal-within-modal warning, no red type, no "DO NOT CLOSE." Sets expectations without creating anxiety. Users will occasionally background anyway; the architecture makes that safe.
- **Delayed render:** modal only shows if migration takes >500ms. Light users never see it.
- **Backgrounding safety.** OS suspension mid-migration → SQLite rolls back on re-open → user returns to pre-migration state → migration re-runs cleanly on next launch. The user sees the screen twice in the worst case; no data is lost because the Realm file remains untouched.
- **Request a background execution window on iOS.** At migration start, call `beginBackgroundTask(withName: "relisten-migration", expirationHandler: ...)` and pair with `endBackgroundTask` on commit (or failure). Gives iOS ~30s of execution time after the user backgrounds, which covers most realistic migrations that are already underway. The expiration handler logs and lets the transaction roll back naturally.
- **Android.** Rely on the rollback-and-retry path; a foreground service is overkill for a 5–15s operation and the platform is more permissive about short-lived work during app transitions.

### 5.7 Expected budgets

| User profile | Expected duration |
|---|---|
| Light (tens of tracks, hundreds of history) | <1s, no modal |
| Medium (hundreds of tracks, thousands of history, hundreds of shows) | 2–5s, brief modal |
| Heavy (100k tracks, 10k history, thousands of shows/sources) | 5–15s, visible modal |
| Budgeted worst case | 30s |

If measured P99 exceeds 30s in staged rollout, hold the gate and investigate.

### 5.8 Failure modes and recovery

| Failure | Behavior |
|---|---|
| Preflight check fails | Diagnostic, fall through to Realm this launch, retry next launch |
| Realm read throws mid-migration | Rollback; diagnostic with model/row; retry next launch |
| SQLite write throws | Rollback; retry once; if a second consecutive failure, fall through to Realm and set a device-local "skip migration" flag until v1.x ships a fix |
| Integrity check fails | Rollback; diagnostic with specific check; retry next launch |
| App killed mid-migration | SQLite journal rolls back on re-open; retry next launch |
| Migration succeeds, app crashes on first post-migration screen | User is past migration (marker set). Kill switch cannot help them — see §6.3 for the rescue path via Realm file retention |

After N=3 consecutive failed migrations on the same device, show an error screen with "Contact support" + "Send diagnostic." Diagnostic includes Realm file size, schemaVersion, failure reason, device info, app version.

### 5.9 Telemetry

- `migration_attempted` — { gate_state, realm_file_bytes, app_version, os }
- `migration_succeeded` — { duration_ms, rows_migrated_by_table, preflight_ms, transaction_ms }
- `migration_failed` — { phase, reason, error_message, attempt_count, duration_ms_until_failure }

Rollout monitored in real time. Success rate per cohort; P50/P95/P99 duration; failure-reason clustering. Kill switch engaged below SLO thresholds.

### 5.10 v2 and skipping v1

- v2's store rollout is gated on ≥95% of active users having launched v1 post-gate-open. Measured via telemetry.
- Users who skip directly from v0 to v2 (e.g., long-absent users after v2 rolls out) are forced by the store minimum-version gate to install v1 first. No need to ship Realm inside v2.

---

## 6. Rollout, Code Layout, Observability

### 6.1 v1 code layout

```
relisten/
  realm/          ← existing, untouched (read-only during migration, otherwise unused post-migration)
  db/             ← new
    sqlite.ts              (driver init, schema migrations, update_hook wiring)
    repository.ts          (typed writers, transaction API)
    collections.ts         (long-lived singletons)
    queries.ts             (parameterized collection factories)
    invalidation.ts        (WriteSet bus, tripwire)
    models/                (plain data classes + toSqliteRow / fromApi / fromRealm)
    network_backed_behavior.ts
    migration/
      run.ts               (orchestrator)
      preflight.ts
      readers.ts           (per-model Realm → SqliteRow[])
      integrity.ts
      progress.ts
  realm_compat/   ← shim (v1 only)
    index.ts               (re-exports for call sites that need to pick Realm vs DB at boot)
```

Call sites are rewritten to use the DB path unconditionally post-migration. `realm_compat` is a thin router at the app's root — it selects the whole Realm tree or the whole DB tree at cold launch, not a per-call dual write.

Pre-migration users run the Realm code exactly as today. Post-migration users run pure SQLite/TanStack DB. There is no dual-write window.

### 6.2 v2 code layout

Deletes: `relisten/realm/`, `relisten_compat/`, Realm SDK dependency, `RealmProvider` wrapping, the Realm file on disk (one-time cleanup on first v2 launch), the remote gate, and the tripwire's "is this a Realm-free build" branch.

**v1 lifespan is expected to be a year+.** v2 is cleanup, not a scheduled milestone. Dual code paths in v1 are budgeted for that duration.

### 6.3 Kill-switch semantics

Precisely:
- Gate flipped to `false` **stops new migrations**. Users who have not migrated continue running the Realm path every launch until the gate is re-enabled.
- Gate flipping does **not** revert already-migrated users. Their marker is set; they run SQLite. Rescue requires a v1.x patch with explicit recovery (e.g., a `force_remigrate_on_next_launch` flag that re-reads from the preserved Realm file).
- The Realm file existing for a full version cycle is what makes post-migration rescue theoretically possible. This is the core reason (iii) was chosen.

### 6.4 Kill-switch triggers

- Migration success rate <98% in a 1k-user cohort, OR
- Post-migration crash rate >baseline + 0.5pp, OR
- Any integrity-check failure class exceeding 0.1% of attempts, OR
- Manual decision.

### 6.5 Staged release mechanics

Two gates, both required:

- **Store phased release.** iOS App Store Connect phased release; Android Play staged rollout. 1 / 2 / 5 / 10 / 20 / 50 / 100% over ~7 days. Controls binary distribution.
- **Remote migration gate.** Server config, per-cohort rollout keyed by **install identity** (install ID / Statsig stable ID / equivalent device-scoped identifier). There are no user IDs pre-accounts, so the identity space is install-scoped, and a reinstall is treated as a new cohort member. The cohort function is `hash(install_id) % 100 < N`, stored in remote config and evaluated client-side at boot. Controls whether a given install on v1 actually migrates.

Both gates live simultaneously. Gate starts at 0%; opened only after first store cohort has been on v1 24h without crash spikes. Progression: 1% → 5% → 25% → 50% → 100%, each step held ≥24h with SLOs met.

### 6.6 SLOs during rollout

- Migration success rate ≥ 99% overall (light+medium ≥ 99.5%, heavy ≥ 98%).
- P95 migration duration ≤ 15s on mid-tier; P99 ≤ 30s.
- Post-migration session-1 crash rate within +0.2pp of baseline.

Any SLO breach sustained 24h → hold the rollout. Two consecutive breaches → flip kill switch.

### 6.7 Dev-mode repeatable migration

Landing the migration safely needs repeatable dry runs. A dev menu (gated by `__DEV__`, excluded from release builds at compile time) exposes:

- **Run migration now.** Executes the migration but writes the marker to a dev-only key (`migration_state_dev`) instead of the production marker. Realm is untouched — re-runnable indefinitely against the same source data.
- **Reset SQLite.** Drops the SQLite file entirely. Next launch re-runs migration fresh against Realm.
- **Clear migration marker.** Removes the marker without touching data. Exercises the "boot right after a just-completed migration" path repeatedly.
- **Dump stats.** Row counts per table in both Realm and SQLite, side by side. Catches parity drift during model translation work (§6.8 step 2).
- **Load fixture.** Points the Realm reader at a bundled `.realm` fixture (same small/medium/heavy fixtures used in §8.3) instead of the live Realm. Lets developers test heavy-user migration on their own device without actually being a heavy user.

All dev-menu actions leave the tripwire (§3.7) enabled by default, so schema or invalidation drift surfaces during the dev loop.

### 6.8 Development phasing

PRs land in this order, each independently mergeable to `main` without shipping the feature:

1. **Scaffolding.** SQLite driver, schema, repository skeleton, invalidation bus, tripwire, collection primitives, factory registry. No call-site changes.
2. **Model translation.** Per-model `toSqliteRow` / `fromApi` / `fromRealm`. Tests only.
3. **Migration.** Preflight, readers, integrity, orchestrator. Tested via fixture Realm DBs and a dev-menu action.
4. **NetworkBackedBehavior port.** Parallel implementation, unused by production.
5. **Call-site cutover.** One feature area at a time (artists, shows, offline, player, history). Each cutover replaces `useQuery`/`useObject` with `useLiveQuery`. Gated by a local flag per feature; internal builds only.
6. **Boot switch & gate.** Wire migration into the app boot. Remote gate hooked up. Local flags from step 5 removed.
7. **v1 ship.** Gate closed (0%). Internal testing.
8. **v1 staged rollout.** Open gate in cohorts.
9. **v2 branch opens** only after v1 stabilizes at 100% with SLOs met.

### 6.9 Observability

Migration dashboard:
1. **Funnel:** attempted → preflight-passed → transaction-started → integrity-passed → committed → first-post-migration-session-reached. Drop-off per phase.
2. **Duration distributions:** P50/P95/P99 split by device tier and Realm file size buckets (<50MB, 50–500MB, >500MB).
3. **Failure reasons:** clustered by phase + reason. Top-N table.
4. **Post-migration health:** crash / ANR / session length / screen-open latency, segmented pre/post migration.

### 6.10 Rollout-specific risks

- **Very old Realm schema versions** (<12): Realm's own migrations bring them to 12 automatically, then ours takes over. No special handling.
- **v1 → v0 downgrade:** iOS disallows; Android possible but sideload-only. Realm file untouched; user returns to a valid state, loses only post-migration writes to SQLite (favorites toggled post-migration, new history). Accept.
- **User sits on v1 for a long time without launching:** handled by the v2 cohort-coverage gate (§5.10).

---

## 7. Special-Case Consumers

### 7.1 DownloadManager

Today holds a Realm handle and mutates `SourceTrackOfflineInfo` directly. Post-migration:
- Takes a `repository` reference via DI. All status/progress writes go through `repository.offlineInfo.upsert/update`.
- Subscribes to `remainingDownloads` via `.subscribe(cb)` (not `useQuery`) to drive concurrency scheduling.
- No React involvement; plain TS service.

**Progress persistence is throttled by default, not per raw progress event.** The contract:

- **In-memory progress state** is authoritative for UI smoothness. Active-download progress emits to a small in-memory signal that the player/download UI subscribes to via its own observer (not through the DB). UI updates happen at whatever cadence the OS delivers progress (typically 5–20 Hz).
- **SQLite persistence** lands at whichever comes first: once per second (1 Hz), or when the download crosses a byte/percent bucket boundary (e.g., every 5% or every 1 MB, whichever is smaller). This cuts per-track write volume from potentially 100+/track to ~20–30/track, without losing meaningful resumability.
- **Terminal-state writes flush immediately, unthrottled.** Any transition to `Succeeded`, `Failed`, `Cancelled`, or `Queued → Downloading` persists in the same tick it happens, because these states drive downstream invalidation (offline availability indexes, queue state, UI list re-renders) that must not be delayed by the throttle.
- **App backgrounding / shutdown** triggers a flush of pending throttled writes before releasing. iOS's `applicationWillResignActive` / Android's `onPause` hooks into the DownloadManager's flush path.

This keeps the hot write path cheap even during many concurrent downloads, while guaranteeing that resumable state on disk is never more than ~1s stale and that state transitions are always crisp.

### 7.2 Audio player queue

`PlayerState` is a sentinel singleton. Post-migration:
- `playerState` collection is a one-row singleton. Writes via `repository.playerState.update(patch)`.
- Queue changes during scrubbing/shuffle debounce the persistence write. In-memory queue is authoritative within a session; SQLite is the post-restart restore point. (Already implicit with Realm; now explicit.)
- Native player module continues to talk only via its JS bridge. No SQLite or TanStack DB awareness.

### 7.3 CarPlay

Templates today import `@realm/react` in several files. Post-migration:
- Templates subscribe to the same collections via `.subscribe(cb)`. No `useQuery` equivalent — CarPlay templates are imperatively rendered.
- `relisten_car_play_context.ts` takes a `db` reference instead of `realm`.
- Lifecycle tied to app lifecycle; collection TTL isn't a concern.

### 7.4 Last.fm scrobbler

Straight port: writes `lastfm_scrobble_entries`, reads/writes `lastfm_settings`. All via repository. No live-query subscription needed — scrobbler pulls settings on demand.

### 7.5 Legacy migration page

`relisten/pages/legacy_migration.tsx` (today's Realm-schema-migration screen) is superseded by the migration screen in §5. Deleted once v1 ships.

---

## 8. Testing Strategy

### 8.1 Unit / reactivity

- Each long-lived collection: write → assert state → assert subscribers notified with expected delta.
- Each factory collection: two subscribers with same params share an instance; last-unsub + TTL releases it; writes to declared tables invalidate; unrelated writes don't.
- Invalidation bus: no-op with no subscribers; failed write doesn't emit; rollback doesn't emit.

### 8.2 Repository

- Per-table writer: upsert / update / delete / upsertMany roundtrip correctly, emit expected `WriteSet`.
- `transaction(fn)`: multi-writer case emits one commit, one event listing all tables. Throw rolls back; no event.
- `rawWrite` with mismatched declared tables triggers tripwire in dev, succeeds in prod.

### 8.3 Migration

- Fixture Realm DBs at three sizes: small (near-empty), medium (typical user), large (synthetic heavy user — 100k tracks, 10k history, thousands of shows/sources).
- Per fixture: run migration, assert row-count parity, offline-breadcrumb integrity, favorite derivation, idempotence (marker present → no-op on second run).
- Fault injection: fail at every phase boundary; assert clean rollback + retry-safe next run.

### 8.4 Performance

- Migration: P50 / P95 / P99 duration on heavy fixture. Measured on CI emulator and at least one physical device per platform tier (iOS mid + low; Android mid + low).
- Repository: batch upsert throughput (rows/sec). Target ≥20k rows/sec on mid-tier.
- Collection: cold start of 1k-row collection ≤50ms.

### 8.5 End-to-end

- Detox or Maestro: launch → forced migration (via fixture) → complete → navigate artists → shows → offline. Smoke covers top UI. Both migrated and unmigrated boot modes run the full flow.

### 8.6 Driver selection benchmark

See §9.1.

---

## 9. Open Questions & Appendix

### 9.1 Driver selection (resolved during scaffolding)

Candidates: `op-sqlite` (JSI, batch API, `update_hook`, widely used), `expo-sqlite` (now JSI, New Architecture native, zero extra dep since we're already on Expo), `react-native-quick-sqlite` (predecessor to op-sqlite, less active).

Criteria, weighted:
1. Batch upsert throughput (primary).
2. `update_hook` callback cost (tripwire + per-row safety net).
3. New Architecture + Expo Router compatibility.
4. Bundle size impact.
5. Maintenance activity.

Methodology: micro-benchmark in a throwaway Expo app, same device. 100k-row upsert in a single transaction, with `update_hook` enabled vs disabled. Results and recommendation are appended to this spec as an addendum when the scaffolding PR lands.

### 9.2 Open questions to resolve during implementation

- **TanStack DB external-source collection API.** Does the current version let us build a `SQLiteCollection` type directly, or do we adapt via `queryCollectionOptions` + a TanStack Query that hits SQLite? Shouldn't change architecture; affects internals of `queries.ts`. Resolve in scaffolding spike.
- **Boot-sequence placement.** The migration trigger must run *before* any screen attempts a DB read. Likely a `BootGate` component that renders the migration UI or the Expo Router root based on state.
- **Value stream abstraction.** Whether to keep `EmittableValueStream` / `CombinedValueStream` as a thin adapter over TanStack DB live queries or collapse them. Leaning keep, to minimize churn in existing ViewModel patterns. Revisit after a few call sites port.

### 9.3 What this unblocks

- The user-accounts spec's named prerequisite is satisfied.
- `collections.ts` / `queries.ts` separation matches the user-accounts data layer design directly; server-backed collections (playlists, server-side favorites, settings sync) slot in without further restructuring.
- The offline outbox pattern the user-accounts spec describes becomes feasible because all mutations already go through a centralized repository with a single commit/invalidate surface.
