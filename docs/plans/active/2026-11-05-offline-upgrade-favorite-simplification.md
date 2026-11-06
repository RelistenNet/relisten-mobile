# Simplify offline upgrades, catalog reads, and favorites

**Superseded:** [Simplify V4 around the existing Realm models](2026-11-05-v4-realm-relationship-simplification.md)
records Alec's later decisions and the implemented replacement. This document is
historical: its persisted result lists, load timestamps, copied presentation
objects, and favorite facade were removed. Its earlier test totals do not describe
the final implementation.

This ExecPlan is a living document. Keep Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective current during implementation.

## Purpose and scope

A schema-16 installation must upgrade offline, display its saved songs and
venues, follow their cached show links, and play its downloaded files. Later
catalog refreshes replace the relevant collections, including successful empty
results. Upstream song and venue merges must keep working after that upgrade.

Restore the responsibilities of the original `NetworkBackedBehavior`: observe
Realm, fetch through the API client, apply data, and expose loading and errors.
The API client coalesces HTTP requests. Repositories own collection membership
and freshness. Screens see one song contract across imported and normalized
records. The two stored representations and their identities remain distinct.

Preserve imported UUIDs, media files, queue occurrence IDs, checkpoints, history,
and ordinary anonymous favorites. Alpha account and experimental canonical
favorite formats may be discarded. No production migration, deployment, or reset
of an existing user's device is authorized.

This plan supersedes the offline-upgrade and query-cache design in the October
31 V4 pilot plan. The November 5 revision below also replaces the earlier version
of this plan, which retained `CatalogQueryState` and conditional GETs.

## Progress

- [x] (2026-11-05) Read Alec's engineering guide and inspect the released
  schema-16 baseline at `3e7d26165147db8e443c46f381d8b7651706f0bd`.
- [x] Commit independent GET retries, refresh status fencing, shared artist
  prerequisites, inverse-read improvements, and generated iOS project updates.
- [x] Freeze the actual schema-16 definitions and reproduce hidden offline songs
  after disabling migration-created HTTP cache entries.
- [x] Replace HTTP query-state membership with collections owned by domain models.
- [x] Remove `queryKey`, ETag handling, and catalog state from the generic executor.
- [x] Move overlapping-request deduplication and supersession into the API client.
- [x] Give song and venue screens shared presentation contracts.
- [x] Centralize ongoing favorite resolution and saved-target commands.
- [x] Remove the local schema-19 compatibility and HTTP cache-seeding experiment.
- [x] (2026-11-05) Complete final full-suite checks (333 tests), isolated simulator
  qualification, simplicity review, and two-pass independent review.

## Decision Log

- Only schema 16 has shipped. A release device upgrades directly from 16 to the
  final schema. Intermediate schema numbers protect local development opens;
  they do not imply a sequence of release migrations.
- Alec permitted discarding alpha account and experimental favorite state. That
  permission does not extend to recordings, downloaded files, queues, history,
  or ordinary anonymous favorites from schema 16.
- On November 5 Alec rejected the coupling between HTTP validators, generic
  network execution, and displayed membership. Remove `CatalogQueryState`
  entirely rather than rename it or put its HTTP keys behind a helper.
- Store successful collection membership on its owner. A nullable load time
  distinguishes an unapplied collection from an applied empty one and supports
  the existing 15-minute freshness interval where the repository uses it.
- Imported and normalized records may remain separate. A shared song adapter
  supplies names, counts, navigation identity, and favorite targets. Screens
  must not repeat the same imported/normalized decisions.
- ETags are not required for catalog correctness. This implementation fetches
  bodies when refreshes run. It retains transient GET retries and coalesces
  overlapping requests without retaining response bodies after completion.
- Catalog redirects describe ongoing public catalog merges. Favorite rows and
  queued account commands retain their literal saved targets.

## Responsibilities and implementation

### Network execution

`relisten/api/catalog/transport.ts` performs HTTP, JSON parsing, and bounded GET
retries. POSTs are not automatically retried. Valid JSON bodies work without an
ETag. The transport has no Realm dependency.

`relisten/api/client.ts` owns an in-flight map keyed by request path. Ordinary
callers share the same response object. A forced request supersedes an older
request for that resource. After HTTP finishes, the latest per-path token remains for the lifetime of
the API client. A live token check prevents an older body that is still preparing
its parents from overwriting a newer refresh. Completed promises and bodies are
released; no ETags or persistent request state are stored.

`relisten/realm/network_backed_behavior.ts` subscribes to local data and invokes
fetch/apply. A Realm transaction publishes an apply atomically. A weak set marks
shared response objects that have already been applied to that Realm; failed
transactions do not mark them applied. This allows an imperative HTTP consumer
to share a request with a repository without accidentally suppressing the write.

The executor fences loading/error updates by its refresh generation. It joins an
ordinary refresh to its own pending work. Mounted failed behaviors can retry on
connectivity restoration; teardown removes them from retry eligibility. A
repository can implement `shouldPerformNetworkRequest` using its domain data.
Neither that method nor the executor knows HTTP validators or endpoint keys.

### Stored collection membership

`relisten/realm/catalog_apply.ts` owns resource-to-Realm mapping and exact
membership updates. The caller supplies its write transaction. Shallow resolver
or inventory patches preserve collections they do not own.

An artist stores its ordered song and venue IDs and their successful load times.
Before the corresponding load time exists, browse readers use retained imported
rows for that artist. Afterward they use exactly the stored membership, including
an empty list. Hydrating a favorite does not add it to a browse collection.

A normalized song stores its show and recording UUID lists separately. Artist
venue relationships and global venues own separate show lists. Imported venue
and tour details also store their own show membership. An imported song uses
its existing `shows` relationship. Removing a link must preserve the shared show
and all downloaded descendants. The apply code skips replacing unchanged ID
lists.

`relisten/realm/value_streams.ts` adds projection and switching streams. Owner
changes replace the selected child subscription. Explicit notification key paths
exclude inverse recording graphs; observing a selected row alone still allowed
unrelated changes to propagate through its linked parents. Readers project data
without the React object wrapper eagerly traversing inverse relationships.
Listeners are removed on teardown.

### Song and venue presentation

`relisten/realm/models/song_view.ts` exposes `SongItem`: one stable list/route
identity, artist UUID, name, show count, optional recording count, and favorite
target. Imported-song and normalized-song adapters each build that contract.
They do not merge stored records or infer matches by title.

`models/song_repo.ts`, `models/shows/song_shows_repo.ts`, and
`models/song_tracks_repo.ts` choose the appropriate stored representation and
API resource. Old raw-UUID song links still work. Current links carry an opaque
catalog ID. Routes no longer require a separate `songKind` parameter.

`models/venue_view.ts` supplies a corresponding venue contract with name,
location, aliases, count, and favorite target. Artist and global detail readers
preserve their respective counts. Venue screens no longer choose between three
optional roots or carry a `venueKind` parameter.

### Ongoing favorite merges

`relisten/realm/catalog_identity.ts` validates canonical redirect chains and
persists them with the returned catalog entities. Imported references cannot
redirect. Cyclic or wrong-kind responses roll back the transaction.

`relisten/library/favorite_library.ts` owns the association between displayed
entities and saved favorite targets. Components use its hooks. If saved A now
resolves to B, the list displays B once, the heart on B is selected, and removing
B removes every active-account saved target that resolves to it. Another
account's rows and existing outbox target IDs are unaffected.

`favorite_catalog_refresher.ts` refreshes active canonical references even when
metadata already exists. It also fills missing imported parents. Requests use
the existing maximum of 500 references. Refreshing runs independently of
authenticated account sync, including for anonymous favorites.

The lifecycle coordinator supplies foreground and connectivity changes.
Membership/account changes during a request schedule a coalesced follow-up.
Repeated unchanged environment updates do not start another request. Failed
catalog refreshes preserve membership, labels, redirects, and queued commands.
A learned merge remains readable after an offline restart.

## Upgrade and recovery

`relisten/realm/schema.ts` uses schema 22 because the disposable local simulator
already opened 21. A released installation still performs one 16 -> 22 upgrade.
The migration converts actual stored formats; it does not construct HTTP cache
state or make network requests. Existing player migration and anonymous-favorite
typed-ID conversion remain. Permitted alpha account/session/outbox cleanup stays
limited to that state.

The frozen schema fixture is exported from the actual comparison commit, not
constructed by removing today's fields. Its test opens an on-disk version-16
Realm with the current configuration and startup repair. It checks both artist
normalization settings, cached song/venue detail, a valid downloaded MP3 and its
byte digest, repeated queue occurrences, selected occurrence/time, history, and
ordinary anonymous favorites.

Do not reset the user's configured simulator. The isolated qualification device
is `11966009-F108-4CE0-A7B6-DC9C7AB84D3E`, named Relisten Upgrade Qualification.
Only its generated fixture data may be replaced. A source revert cannot restore
records deleted by an incorrect migration, so retain the independent schema-16
fixture and migration tests.

## Verification

Run from the repository root after `source ~/.nvm/nvm.sh` and `nvm use`:

    yarn test relisten/realm/network_backed_behavior.test.ts relisten/realm/catalog_apply.test.ts
    yarn test relisten/realm/migrations/catalog_migration.test.ts relisten/realm/account_identity_upgrade.test.ts
    yarn test relisten/library/favorite_membership_projection.test.ts relisten/library/favorite_catalog_refresher.test.ts
    yarn test
    yarn ts:check
    yarn lint
    npx expo export --platform ios --output-dir /tmp/relisten-network-rework-export
    git diff --check

Verify behavior through API payloads, real Realm transactions, and repository
subscriptions. Required cases include overlapping requests applying once, an
imperative consumer sharing that request, failed-apply rollback/retry, superseded
responses, manual refresh, a fresh empty collection, missing selected rows,
shallow patches, anonymous merges, chained merges, multiple aliases, scope
switches, unavailable references, offline removal, and invalid redirects.

In the isolated simulator, seed schema 16 and a valid silent recording at the
expected imported UUID filename. Use a separate Metro on 8082 with
`EXPO_PUBLIC_RELISTEN_CATALOG_ORIGIN=http://localhost:43999`; leave the catalog
port closed for the offline-upgrade case. Cold launch with
`-RCT_jsLocation localhost:8082`. Verify browse and detail labels, saved show
links, the selected second queue occurrence at 42 seconds, and native playback
from its existing local file. An unavailable catalog API is the qualification
condition; Metro still needs its development connection.

Then use a local fake resolver to return A, later B for the same saved A. Verify
My Venues changes, B remains selected, offline restart keeps B, and removing the
row addresses saved A. Real Realm tests cover account/outbox behavior independently
of this anonymous simulator exercise.

## Surprises & Discoveries

- Schema 16 already contains the relationships needed for offline song and venue
  rendering. The missing data was fetch bookkeeping demanded by the newer reader.
- The first simplification removed synthetic cache seeding but left displayed
  membership dependent on `CatalogQueryState`. Alec's correction required removing
  that coupling rather than preserving it under another helper.
- Realm's object-set `clear()` deleted the linked shows in the regression test.
  Remove only absent links with `delete(value)` and retain the shared objects.
- The installed React Compiler rejects `try/finally` without a catch inside the
  refresh hook. Use the promise's `finally` callback for loading cleanup.
- The compiler also dropped the version dependency from
  `useMemo(() => library.venueItems(), [library, version])`. Native testing showed
  a stale venue label while its heart updated. The isolated compiler transform
  confirmed a cache keyed only by `library`. Subscribe directly to a stable
  venue-array snapshot from `FavoriteLibrary`; its version stays internal.
- A selected track query still received unrelated changes through linked
  objects until its notification key paths were limited. Selected queries and
  explicit key paths together avoided the unnecessary recording-list rebuild.
- Fencing only the HTTP phase allowed an older show response to overwrite a
  newer one while the older repository awaited artist preparation. Retain the
  latest request token through that preparation, without retaining its body.

## Outcomes & Retrospective

The revised implementation passes 333 tests across 46 files, TypeScript, lint,
and an iOS Hermes export on November 5. The first review found an imported
favorite-control ID mismatch, a delayed-response overwrite, and unrelated-row
projection work. The fixes have shipping regressions. The second reviewer
independently replayed the delayed-owner and recording/venue stability cases,
then validated the venue snapshot fix. No actionable review findings remain.

The isolated iPhone 17 simulator upgraded actual schema-16 fixture data to 22
with the catalog port closed. It displayed cached song and imported-venue shows,
restored queue occurrence `second` at 42 seconds, and played the retained MP3
through the native player using its existing imported UUID filename. Both
normalization settings are also covered by the disk-backed upgrade test.

A local fake resolver returned later successors for an anonymous favorite saved
against `venue_0000000a`. The app displayed the survivor while preserving saved A.
The final foreground refresh changed the mounted row to “Merged while open” in
the same process (PID 48990) and kept its heart selected. With the fake API
stopped and offline mode selected, another cold launch retained the label and
heart. Removing the row left saved A with `effectivePresent: false` and created
no favorite for `venue_0000000d`. The retained audio matched the original 60-second
fixture byte for byte (SHA-256
`d062a09cf2ff5194b46c28e3a32ff779db218c6276abc0d5982dc7aba116eaa5`).

Local evidence is in `/tmp/relisten-network-final-{tests,types,lint-check,export}.log`,
`/tmp/relisten-native-merge-{before-offline,after-offline-removal}.json`, and
`/tmp/relisten-network-validation-probes/`. The original hidden-offline-data
reproduction is `/tmp/relisten-upgrade16-reproduced.log`. Test and simulator
artifacts are local evidence, not production results.

Native Drums latency and peak memory have not been benchmarked. The regression
probe establishes zero recording-list emissions for an unrelated same-artist
track correction, with the selected row wrapper preserved. Large response
parsing and mapping still take work proportional to the returned collection;
pagination remains outside this change. No vendor patch is introduced.

The independent fixes and project metadata are committed. This redesign remains
uncommitted for review. Unrelated workspace documents and IDE settings were left
untouched. No production data, API deployment, or existing user simulator data
was changed.
