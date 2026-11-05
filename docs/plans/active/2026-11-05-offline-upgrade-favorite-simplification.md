# Simplify offline upgrades and ongoing favorite merges

This ExecPlan is a living document. Keep Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective current during implementation.

## Purpose and scope

Someone upgrading from `codex/ios-player-refinement`, Realm schema 16, must be
able to open the app offline, browse the catalog already on the device, follow
cached song and venue links, and play downloaded files. Reconnecting loads V4
data through the normal repositories. An applied empty response remains empty.

Future upstream song and venue merges must also work. A favorite saved against
A can display the surviving entity B while its pending and synced commands
continue addressing the saved target A. This is ongoing catalog behavior.

The simplification removes HTTP cache construction from migrations and removes
saved-versus-resolved identity decisions from components. It preserves imported
UUIDs, media files, queue occurrences, playback checkpoints, history, and ordinary
local favorites. Alpha account and experimental canonical-favorite data may be
discarded; preserving those experiments is not a release requirement.

This plan replaces the offline-upgrade and merged-favorite decisions in the
October 31 V4 pilot plan. The implementation is still pending. This document
does not authorize a production migration, deployment, or a device data reset.

## Progress

- [x] (2026-11-05) Read Alec's engineering and communication guide and inspect
  the schema-16 comparison branch and current readers, sync, and migration code.
- [x] (2026-11-05) Confirm the release baseline and permission to discard alpha
  account/favorite experiments.
- [x] (2026-11-05) Write the implementation, deletion, and qualification plan.
- [ ] Build an independent schema-16 upgrade fixture and reproduce the offline
  rendering failure without HTTP cache seeding.
- [ ] Replace cache-seeding migration with a shared collection-reading rule.
- [ ] Centralize ongoing catalog resolution and favorite reads/writes.
- [ ] Remove experimental compatibility code and consolidate startup conversion.
- [ ] Complete focused regressions, simulator qualification, and simplicity review.

## Decisions and evidence

### Decision Log

- The release upgrade starts at schema 16. No later Realm migration has shipped.
  Source: Alec's clarification on November 5; the comparison branch's
  `relisten/realm/schema.ts` declares `schemaVersion: 16`.
- Alpha testers' account and experimental favorite state need not be preserved.
  Source: Alec's November 5 clarification. This does not authorize deleting
  version-16 catalog records, downloads, history, playback state, or normal
  anonymous favorites.
- Preserve one collection-selection rule in repository code. Before a V4
  collection has been applied, use stored relationships. Afterward use its exact
  applied membership, even when empty. Do not create cache records to make old
  data readable.
- Keep one catalog-owned redirect mapping and one favorite-facing API. The
  account repository and outbox continue using literal saved targets. Do not add
  a resolved-target field to `UserFavorite` or rewrite an existing outbox target.
- Keep the existing API contracts, request fencing, freshness interval, and
  conditional GET behavior. No server favorite-identity rewrite is proposed.
- Keep commits `42d9c36` (bounded GET retries) and `fedcad3` (latest refresh status).
  They are independent of the redesign and have already been committed.

### Surprises & Discoveries

- Schema 16 already has `Song.shows`, imported venues and show relationships,
  stable player queue/checkpoint objects, and the current offline-info schema.
  Those records do not need to be rebuilt for V4.
- The current migration constructs `CatalogQueryState` rows using HTTP endpoint
  strings. The readers otherwise hide retained song/venue data when those rows
  do not exist. This is a reader dependency on fetch bookkeeping, not missing
  offline data.
- The current schema-19 conversion exists only to preserve the local
  `UserFavorite.resolvedTargetId` experiment. A direct schema-16 upgrade never
  contains that field.
- `FavoriteMetadataHydrator.hydrateMissing` skips favorites with cached metadata.
  That cannot discover a later merge of an already cached entity. It also runs
  from authenticated favorite sync, which cannot provide ongoing merge discovery
  for anonymous favorites.
- The server's catalog resolver follows canonical song/venue merge chains. The
  account mutation contract binds a favorite ID to its saved target. Catalog
  resolution and favorite command identity therefore have different jobs.
- Existing account identity conversion preserves anonymous favorites but resets
  alpha account rows, mutations, and credentials. Preserve the permitted reset
  while removing compatibility for later local experiments.

### Outcomes & Retrospective

Planning is complete. No runtime changes or new qualification results are claimed
by this document. The existing 326-test result predates this redesign and does
not prove the proposed version-16 workflow.

## Responsibilities after the change

`relisten/realm/schema.ts` and account conversion code perform actual schema and
stored-value conversion. They retain existing media/catalog/player records and
convert ordinary schema-16 favorites into the current typed-target format. They
do not know routes, HTTP methods, query keys, ETags, or collection freshness.

`relisten/realm/catalog_projection.ts` and the song/venue repositories choose
which locally stored rows make up a displayed collection. A missing applied
snapshot and an applied snapshot containing zero children are distinct states.
`CatalogQueryState` remains the existing network cache record; no second
persisted collection model or duplicate membership list is needed.

Moving the current seeding code behind a repository helper would still fabricate
fetch bookkeeping during upgrade. The shared reader removes that operation.
Its cost is one explicit choice between retained relationships and a real applied
snapshot, with both choices tested through the same repository interface.

`relisten/realm/catalog_identity.ts` owns canonical redirect storage, validation,
and lookup. Both resolver responses and canonical detail responses can teach it
a redirect. Imported UUID-backed references retain their existing identities.

A small `FavoriteLibrary` API in `relisten/library/favorite_library.ts` combines
the existing membership projection, catalog lookup, and `FavoriteRepository`.
It owns the actual association between displayed entities and saved targets.
Reuse the existing projection's indexed data and subscriptions; do not introduce
another favorite cache or copy its membership state into a second observer.

`FavoriteRepository`, `FavoriteSyncAdapter`, and `FavoriteRemoteLibraryApplier`
continue persisting and syncing explicit saved targets. Components use
`useFavorite` and favorite-list hooks backed by `FavoriteLibrary`. Components do
not query redirects or select a mutation ID.

## Milestone 1: establish the real upgrade contract

Create a frozen test schema exported from comparison commit
`3e7d26165147db8e443c46f381d8b7651706f0bd`. Record that provenance beside the
fixture. Do not derive the old schema by deleting fields from today's models:
that can accidentally make old and new schemas agree.

Seed an on-disk Realm with one downloaded recording, its artist/year/show/source
and set, an imported venue, an imported song with cached shows, queue occurrences
including a repeated track, a selected occurrence/checkpoint, history, and normal
anonymous favorites using version-16 fields. Include another artist and tombstoned
rows so fallback reads cannot silently cross owners or revive deleted records.
Use a small valid test audio file and record its path and byte digest.

Open that file through the real `realmConfig` migration and
`prepareRealmForUse`. Network access is unavailable for this case. Exercise the
normal repository/view hooks for browse and detail, plus player restore. This
should reproduce hidden cached song/venue data after disabling the current
seeding function, while the underlying records and file remain present.

Observable result: the fixture distinguishes loss of data from refusal to render
retained data. Save the failing result before changing readers. Preserve existing
pre-16 player/favorite regression cases if those older installs remain supported.

## Milestone 2: make stored collections readable without synthetic cache state

Add one small selection function in `catalog_projection.ts`. Its inputs must
distinguish an unapplied snapshot from an applied collection that happens to be
empty. It returns the applied collection when one exists; otherwise it calls the
stored-data reader. The stored-data read should be lazy so it does no work once
an applied snapshot exists. Do not pass endpoint strings into this function.

Use that rule at these collection boundaries:

- Artist songs: existing active imported `Song` rows for the artist until a V4
  response has applied; then the response's canonical/imported ordered entries.
- Artist venues: existing active imported `Venue` rows with the same browse
  eligibility as schema 16; then the exact V4 artist-venue/imported membership.
- Imported song detail: the existing song and its cached `shows` relationship
  until detail membership has applied; then the selected response membership.
- Imported venue detail: the existing venue and cached active shows for that
  artist/venue until detail membership has applied; then selected membership.

Canonical song/global-venue detail has no schema-16 counterpart. It may use cached
canonical records learned during normal V4 operation, but must not guess a match
to imported records by title, name, or location. A partially cached collection
must not be presented as a complete server result.

Refactor `models/song_repo.ts`, `models/venue_repo.ts`,
`models/shows/song_shows_repo.ts`, and `models/shows/venue_shows_repo.ts` around
named readers and explicit variant selection. Keep model-specific querying and
mapping next to the corresponding repository. Avoid a general query-description
framework or a separate V3 implementation.

Use types that rule out impossible root combinations. In particular, replace the
venue detail object with several optional root models by a discriminated union
or one explicit presentation model. Choose once per variant rather than putting
kind checks inside every query predicate and returned field. Keep React hooks
unconditional; named readers must not introduce conditional hook calls.

Separate view readiness from HTTP state. `hasAppliedData` describes a real V4
apply; do not set it to true for retained schema-16 rows. Detail screens and
`isLocalDataShowable` must instead recognize a displayable cached root and its
available children. Audit loading/error suppression in the song route and
`pages/venues/artist_venue_detail_page.tsx`; cached data must remain visible during
offline errors and revalidation without leaving the screen permanently loading.

Keep network behavior unchanged: no ETag without an applied response, first
online use fetches a body, successful application commits entities/membership/
validator together, and failed application preserves the previous state. Once
V4 returns an empty collection, retained rows must not reappear as fallback.

Observable result: milestone 1 passes with zero migration-created
`CatalogQueryState` rows. Refreshing with an empty V4 response hides membership
without deleting the underlying recording, download, or history record.

## Milestone 3: centralize ongoing catalog and favorite resolution

Keep `CatalogRedirect` as a small catalog record containing an old canonical ID
and its replacement. No account ID, favorite ID, response body, or duplicated
metadata belongs in it. The catalog API owns reading and updating these records.
Consumers ask for a resolved catalog target or its metadata.

Persist redirects and returned entities in the same transaction. Validate kind
and redirect chains before committing: a malformed response must preserve the
last usable state rather than create a cycle that throws during rendering.
Support A -> B followed later by B -> C and multiple saved aliases for one
survivor. Alias resolution must not require reading the entire recording graph.

Capture canonical root changes learned from ordinary detail requests as well as
`resolveCatalogReferences`. The applying catalog code receives the requested
target explicitly and compares it with the returned target. Do not infer identity
by parsing HTTP cache keys or scatter redirect writes through UI hooks.

Refactor the existing hydrator into the catalog-refresh collaborator used by
`FavoriteLibrary`. Resolve active saved canonical references even when metadata
already exists. Retain missing-parent hydration for imported favorites. Bound
requests using the existing maximum of 500 references and coalesce overlapping
refreshes; do not issue a request for every row render or duplicate resolver
requests when account sync and a foreground event coincide.

Remove the hydrator dependency and awaited hydration call from
`FavoriteSyncService`. That service completes account membership/outbox sync.
The favorite API observes the applied membership and schedules public catalog
refresh separately. Repeated identical environment updates do nothing; changes
to the active target set during a request schedule at most one follow-up pass.

Refresh catalog references when the app becomes active online, connectivity
returns, the active favorite set changes, or a user explicitly refreshes My
Library. Resolve metadata for newly received server favorites after their
membership is applied. Use existing lifecycle/connectivity signals from
`favorite_sync_coordinator.tsx`; do not add polling or a second retry scheduler.
This public-catalog work must also run for anonymous favorites, independently of
whether authenticated account sync can run.

Capture the active account generation and stop obsolete account work. Catalog
refresh failures retain existing labels, mappings, favorites, and pending
commands. They must not fail an otherwise successful account sync or block
offline startup. A device cannot learn an upstream merge while offline; once it
has learned the merge, the result must remain available offline after restart.

`FavoriteLibrary` exposes display-ID-based `isFavorite`/`setFavorite` operations,
subscriptions, and favorite-list items. Internally it groups saved targets by
resolved target. A saved A resolving to B means:

1. The list displays B and navigates to B.
2. A heart on B is selected without creating a second B favorite.
3. Removing B submits ordinary removals for all active-account saved targets
   resolving to B, including A. Another account's favorites are unaffected.
4. Removing A offline stays removed when B is later discovered or account sync
   retries. Resolution never recreates a favorite or retargets an outbox entry.

For each command, capture the active account generation, find its saved targets,
and pass that same capture into the repository write. Do not reuse a target list
from a view rendered under a previous account. The repository's existing capture
check remains the final write guard.

Keep saved-target associations private to this API. Return one logical list item
per surviving entity when A1 and A2 both resolve to B. `useFavorite` becomes a
thin subscription/action hook. `library_venues_page.tsx` obtains favorite items
from a hook and no longer queries `UserFavorite`, constructs `CatalogIdentity`,
or calls `favoriteVenueItems` itself. `LibraryIndex` consumes the same resolved
membership projection for artist/library membership rather than maintaining a
second alias implementation. Preserve unavailable/retired favorite entries with
a usable label or existing unavailable state; resolution is not permission to
discard user membership.

Rewriting favorites to their surviving IDs on the server could reduce client
mapping, but would change the favorite-ID/target and retry contracts. It is not
needed for this simplification. The single catalog mapping plus favorite API
preserves the contracts already implemented by both clients and server.

Observable result: cache A, favorite it, then change the fake API so A resolves
to B. A subsequent normal catalog refresh updates My Library even though A's
metadata was already present. Heart state, navigation, offline restart, removal,
and server mutation targets all agree.

## Milestone 4: remove experimental upgrade code

Delete `realm/migrations/catalog_migration.ts` after milestone 2 is proven. Remove
its call/import from `schema.ts`. This removes both the HTTP membership seeding
and the schema-19 favorite redirect transfer. Remove the obsolete tests for those
operations; their replacement protection is the direct schema-16 workflow and
the ongoing merge workflow.

Retain the actual schema-16 field conversion in `account_identity_upgrade.ts`:
`favoriteUuid/catalogType/catalogUuid` become `favoriteId/targetKind/targetId`,
including imported-song/venue target kinds. Preserve normal anonymous favorite
membership and pending intent through offline conversion. Keep permitted alpha
account cleanup explicit and limited to account/session/outbox state. Do not
delete public catalog rows, completed downloads, queue/checkpoint, or history as
part of that cleanup. Do not add a resolver network call to migration/startup.

Use one final schema version above 16. The current local database has already
opened version 20; if this implementation changes that schema, use 21 rather
than attempting a downgrade. A released device still executes one 16 -> final
upgrade. There is no requirement to preserve intermediate alpha favorite formats
or execute a sequence of releases. Keep the existing older player conversion
for genuinely older supported versions; it is a no-op for version 16.

Delete `favorite_venue_items.ts` if its work has moved into the favorite API.
Remove the public `LibraryIndex.favoriteTargets` forwarding method and hook-level
alias command construction once the API owns them. Keep the redirect record and
necessary catalog lookup code; ongoing merges are not disposable migration code.

Update the V4 pilot plan's current description to match the final implementation.
Do not leave its schema-19/20 experiments described as release requirements.

## Verification and implementation sequence

Use five reviewable changes: (1) frozen schema-16 fixture and failing upgrade
case; (2) collection reads and removal of cache seeding; (3) catalog resolution
refresh and favorite API, including UI integration; (4) removal of obsolete alpha
compatibility; (5) qualification evidence and final cleanup. Avoid landing an
intermediate change that removes seeding while readers still require it.

Run commands from `/Users/alecgorge/code/relisten/relisten-mobile`, after
`source ~/.nvm/nvm.sh` and `nvm use`:

    yarn test relisten/realm/migrations/catalog_migration.test.ts relisten/realm/catalog_apply.test.ts
    yarn test relisten/realm/account_identity_upgrade.test.ts relisten/realm/network_backed_behavior.test.ts
    yarn test relisten/library/favorite_membership_projection.test.ts relisten/library/favorite_metadata_hydrator.test.ts relisten/library/favorite_sync_adapter.test.ts

Adapt the focused filenames when tests move with their owning modules. Add a
favorite-library test for the real hook/API -> repository/outbox operation. Keep
HTTP response parsing, Realm persistence, and mutation serialization real in the
tests that verify those contracts; mock the network and platform edges only.

Required cases beyond the happy path are applied empty collections, both artist
normalization settings, partial cached details, failed apply, a retained validator,
cached A merging later, chained merges, two aliases to one survivor, account
switch during refresh, anonymous favorites, unavailable references, offline
unfavorite followed by reconnect, and rejected cyclic/wrong-kind resolutions.
Test listener-driven updates on a mounted/read subscription, not only a freshly
constructed projection. An empty library must send no resolver request.

Verify important assertions by temporarily restoring the broken behavior and
watching the corresponding case fail. Remove experimental scaffolding and retain
the assertions protecting observable behavior.

After focused tests pass:

    yarn test
    yarn ts:check
    yarn lint
    npx expo export --platform ios --output-dir /tmp/relisten-simplification-export
    git diff --check

Then qualify on the configured iPhone 17 simulator
`063F4104-44E5-480E-94DD-847C0D024D4D`. Use disposable fixture data or back up the
existing Realm and media files first. Seed version 16, install/run the final
reader without deleting the data container, start offline, browse song/venue
destinations, restore the selected queue occurrence, and play the downloaded
file. Reconnect to a local fake/test API, apply new membership and a later merge,
then restart offline and remove the merged favorite. Verify the emitted command
target on reconnect. Capture schema version, record/file identity checks, test
output, UI evidence, and the mutation payload without credentials.

The existing involuntary-authentication-loss policy can clear the playback queue.
Keep migration proof separate from that policy: use anonymous scope for the
offline preservation test and test permitted alpha account reset separately.
Changing general sign-out/expiry behavior is outside this simplification.

## Performance and simplicity checks

Keep the app-owned primary-key offline lookup and selected-artist query changes
subject to their existing focused validation. Do not reintroduce a Realm/React
dependency patch. Display-row prototypes did not demonstrate an end-to-end
benefit and are not part of this plan. Drums pagination is also outside scope.

For merge refresh, record the number of active references, resolver batches, and
requests across repeated environment signals. Coalesced work must scale with
favorites and catalog rows actually needed, not with all recording relationships.
Keep the existing cheap root checks; do not add full graph audits per read.

Run the code-simplifier pass after implementation tests. Read the four song/venue
repositories and the favorite API as a maintainer: each must show who chooses
membership, who resolves catalog identity, and who writes a saved favorite. A
helper that merely hides the old ternaries or endpoint-string construction does
not meet the goal. Remove obsolete optional fields, forwarding-only methods,
duplicate observers, and tests protecting only discarded experiments.

## Recovery, rollout, and final acceptance

All initial work uses local fixtures and fake/test APIs. No API deployment,
production backfill, or user-account mutation is required to prove the design.
Respect the unrelated native-project and documentation changes already dirty in
the workspace. Keep the two simple-fix commits intact and do not commit the
remaining implementation until its replacement behavior is reviewable.

Migration and startup conversion must be repeatable after an interrupted first
launch: an existing completion marker prevents resetting a newly signed-in
account, and failure must not release services against partially converted state.
Use the existing startup ordering and account-generation guards.

Schema upgrades are one-way. Reverting source does not guarantee an old binary
can reopen the upgraded Realm, and it cannot recover deleted records. Use a
fixture/device backup for local recovery; do not enable automatic Realm deletion
on migration failure or reset a retained developer database for convenience.

The work is complete when a direct schema-16 offline upgrade passes, no migration
constructs HTTP cache state, empty V4 results remain authoritative, future merges
work for authenticated and anonymous favorites, components contain no alias
selection logic, and literal saved-target sync tests still pass. Report the
actual checks and remaining device/performance gaps with the final diff.

## References

- [Alec's engineering and communication guide](https://chatgpt.com/space/page_9b73f77577b08191a2eee89942a3192a)
- [V4 pilot history](2026-10-31-v4-catalog-mobile-pilot.md)
- Comparison branch: `codex/ios-player-refinement`, commit
  `3e7d26165147db8e443c46f381d8b7651706f0bd`, schema 16.
- API source inspected for existing contracts:
  `RelistenApi/Services/Catalog/CatalogReferenceLookup.cs` and
  `RelistenUserService/Library/FavoriteMutationService.cs` in the sibling
  `/Users/alecgorge/code/relisten/RelistenApi` checkout. No server changes are planned.
