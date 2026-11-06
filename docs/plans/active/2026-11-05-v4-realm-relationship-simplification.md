# Simplify V4 around the existing Realm models

## Purpose and current decisions

Status: implemented and verified in the existing `codex/v4-mobile-pilot` checkout.
No isolated checkout was created. Alec subsequently requested a checkpoint commit
and a read-only review against `codex/ios-player-refinement`. Alec completed the
prerequisite API change in PR #125; this implementation changes mobile code only.

Use `codex/ios-player-refinement` at `3e7d261` (schema 16) as the design baseline.
Keep its read-Realm, fetch, upsert, observe approach. Add the actual normalized
song and venue concepts with wrappers around live Realm records. Do not copy
metadata into presentation objects or persist duplicate browse ID collections.

This plan replaces the catalog/storage redesign in
`2026-11-05-offline-upgrade-favorite-simplification.md`. Its old completed
checklist does not establish acceptance of this replacement.

Alec's November 5 decisions:

- Keep the current mixed song array with `kind`, `song`, and `imported_song`.
  Add `normalized_song_id` to imported-song resources consistently. Do not split
  arrays or expand artist browse to all imported records. This API change is now
  implemented and deployed through PR #125 (`4dbda9461`).
- Make the song-detail show list online-only. Keep song metadata and the song
  references in embedded track normalization. Offline song detail shows a
  connection-required screen; it does not reconstruct all matching shows from
  Realm. Existing downloaded playback remains supported.
- Do not add a song/show-specific recording endpoint.
- Do not expand the work into a cache/revision protocol or a broad refresh redesign.
- Use baseline-style soft deletion for artist browse: hide omitted song/venue
  rows while retaining metadata and relationships. Restore rows when they return.
  Keep the current venue endpoint; do not add a coverage count or larger response.
- Keep ongoing favorite redirects contained in existing hydration/projection/hooks.
- Remove the rejected persistence/projection scaffolding and qualify the actual
  schema-16 upgrade. These decisions were accepted before the readiness check.

## What went wrong

Persisted HTTP result membership became a prerequisite for displaying existing
Realm records. Moving its IDs onto domain models retained the second membership
system. Copying fields into `SongItem`/`VenueItem` then required more projection
and snapshot handling. The replacement should remove those mechanisms.

The previous discussion withdrew track relocation as a concern and rejected
successfully empty collections as a reason for this design. Neither is an assumed
product requirement. Optional validation changes remain separate decisions.

## Models and reads

`ImportedSong` means today's stored `Song` class. `NormalizedSong` is the V4
canonical song. Keep the imported Realm schema name and UUIDs; TypeScript aliases
can clarify naming without migrating storage.

A song wrapper holds one imported or normalized Realm record. Getters read name,
counts, route identity, and favorite identity. A venue wrapper similarly holds
an imported venue, artist venue, or normalized venue. Artist venues read metadata
through their existing venue link and supply their artist-specific count.
Repositories own notifications; wrappers do not own subscriptions or snapshots.

The artist song response stays a mixed array:

    Array<{ kind, song, imported_song }>

Imported songs expose `normalized_song_id`, including explicit null when no
approved same-artist mapping is available. The server resolves merges to the
survivor. The field is consistent across inventory, detail, search, and resolver
hydration. Browse continues to omit mapped imported rows; that is intentional.
Use the server-selected browse response and soft-prune omitted cached rows,
rather than deriving the exact browse selection from cached mapping coverage.

Resolver hydration does not automatically include the referenced normalized
song's metadata. Preserve the supplied mapping identity without requiring that
record to exist locally, manufacturing placeholder metadata, or fetching every
mapping to construct browse. Resolve the target when its metadata is needed.
The imported record retains its own identity, metadata, and favorite target.

Song-detail show results and timings stay in memory. Use the existing API shapes:
normalized entries contain `{ show, timings, tracks? }`; imported detail contains
plain shows. There is no need to change the imported wire shape merely to share
an offline persistence path that we are removing. Selecting a show/source enters
the ordinary catalog and playback repositories. Do not add a persisted `SongShow`
model, normalized `shows` set, `showUuids`, or load metadata for this screen.
Preserve existing imported song/show links through upgrade where present; the
new detail screen does not depend on them.

Venue and tour detail use existing relationships:

- Imported venue: `Show.venueUuid` / `Show.venue`.
- Artist venue: `Show.artistVenue`, scoped to the artist.
- Global venue: `Show.artistVenue.venue` across artists.
- Tour: `Show.tour`.

Remove added `Artist.songIds`/`venueIds`, song/venue/tour ID membership arrays,
collection-specific `*LoadedAt`, and the replaced `CatalogQueryState` readers.
Keep the request coordination separation in `19ad202`: the API client owns
in-flight requests; `NetworkBackedBehavior` owns local observation, fetch/apply,
loading, and errors.

## Song and venue browse pruning

Keep the current mixed song and venue endpoints. Reconcile their returned
artist-owned rows using the baseline soft-deletion pattern. A temporary comparison
with response IDs during apply does not require a persisted membership list.

Hard-deleting an imported venue clears `Show.venue`, losing its cached name and
location. Deleting an `ArtistVenue` clears cached shows' canonical destination.
Neither deletion requires deleting a show, source, or downloaded file, but they
have different offline presentation effects. Global normalized venues are shared
across artists and cannot be deleted merely because one artist omits them.

Exclude omitted imported rows from artist browse using existing `deletedAt`,
retaining the records for show labels, favorites, and old links. Use the same
soft-deletion pattern for new artist-owned normalized song/artist-venue models.
Metadata hydration preserves an existing browse exclusion; an artist browse
response restores rows that return. Shared global venues are not pruned by an
artist response. Do not physically delete shared catalog objects or media.

## Ongoing favorites

Keep the small catalog A-to-B mapping and existing favorite repository/outbox.
Concentrate display, heart membership, and removal against the original saved
identity in existing hydration/projection/hooks. Refresh canonical references on
existing lifecycle triggers, including anonymous favorites. Do not require the
new `FavoriteLibrary` lifecycle/snapshot framework.

## Five agreed items and implementation order

1. **Song API mapping: complete.** PR #125 adds `normalized_song_id` with no
   envelope or browse-selection change. Readiness review inspected the owning
   code and independently verified production: Goodnight Irene maps to
   `song_00yswbj3`; Road Runner returns explicit null. The production Grateful
   Dead browse endpoint remains a mixed array. Mobile now stores the mapping in
   its ordinary apply path, even when the imported upstream timestamp is
   unchanged. No new revision protocol was added.
2. **Reference wrappers and online-only song detail.** Replace copied song/venue
   presentation objects with wrappers holding live Realm references. Keep song
   metadata and embedded track normalization persisted. Fetch the song's show
   list and timings directly into screen memory; show the connection-required
   screen offline. Do not add a persisted song/show model or targeted endpoint.
3. **Relationship readers and soft pruning.** Remove persisted membership ID
   arrays and collection load fields. Use existing show/venue/tour relationships
   for venue/tour details. Apply the agreed browse soft-deletion rule, retaining
   labels and links. Do not add venue coverage counts or eligibility lists.
4. **Contained favorite redirects.** Retain the catalog A-to-B mapping and
   existing favorite repository/outbox. Extend existing hydration, membership
   projection, and commands for survivor display and removal against saved A.
   Include anonymous refresh and offline use of learned redirects. Remove the
   additional FavoriteLibrary lifecycle/snapshot framework with its replacement.
5. **Cleanup and qualification.** Remove rejected query-state, membership, copied
   metadata, and unused projection machinery alongside their replacements.
   Preserve independently committed network fixes and unrelated workspace work.
   Qualify the actual schema-16 upgrade and review the baseline-to-final diff.
   Preserve imported identities, anonymous favorites, downloads, queue occurrences,
   checkpoint, and history. Offline song detail deliberately requires a connection;
   ordinary cached show/source browsing and downloaded playback remain supported.

Implement in reviewable steps in the existing mobile checkout. Do not commit
without instruction. Preserve recoverable copies of current uncommitted and
untracked work before replacing it. Do not reset the configured simulator or
change production data. Previously authorized alpha account/favorite reset stays
limited to that state.

## Verification

Use behavioral HTTP and Realm tests for changed contracts. Check mounted metadata
updates, song/venue counts and routes, online song-detail results, the offline
connection screen, retained show labels, downloaded playback, queue restoration,
and favorite A-to-B refresh/removal. Keep existing request race/retry regressions.
Run affected tests, `yarn ts:check`, and `yarn lint`; run the full mobile suite after
integration. Measure Drums on the same fixture before and after any performance
claim. No broad test matrix is added solely for abandoned cache mechanics.

## Progress and outcome

- [x] Inspect the review, schema-16 baseline, current mobile changes, and API.
- [x] Investigate actual V4 data before the API update; identify the missing song
  mapping and confirm that venue relationships already appear on show summaries.
- [x] Record the online-only song-detail decision and remove the proposed
  persistence/model requirements for that screen.
- [x] Confirm PR #125's implemented API contract and mapped/unmapped production
   responses; mixed browse shape is unchanged.
- [x] Record acceptance of all five items, including soft pruning and the corrected
  mixed-array contract. No remaining API prerequisite was identified.
- [x] Replace copied song/venue fields with getters over live Realm records.
- [x] Remove persisted browse/detail ID arrays, load timestamps, query-state
  readers, and `catalog_projection.ts`. Retain existing domain relationships.
- [x] Use the existing network-only hook for song shows and recordings. Shared
  metadata is persisted; each screen's result selection stays in memory.
- [x] Soft-prune artist-owned song/venue browse rows without deleting labels or
  links. Metadata patches preserve exclusions; later browse restores returned rows.
- [x] Remove the `FavoriteLibrary` facade and separate refresher lifecycle.
  Keep ongoing redirects in the existing hydrator, projection, and commands.
- [x] Qualify schema 16 to 23 with frozen released definitions and downloaded
  media. Intermediate versions remain local development versions.
- [x] Verify mounted song discovery, offline behavior, and favorite refresh/removal
  on the dedicated qualification simulator. Preserve the user's other simulators.
- [x] Complete the full suite, TypeScript, lint, iOS Hermes export, and final
  simplicity review. No commit, deployment, or production write was made.

### Results and remaining limits

The full mobile suite passed: 331 tests in 46 files. `yarn ts:check`, `yarn lint`,
and an iOS Hermes export passed. Behavioral coverage includes soft-pruning and
restoration, imported mapping changes without timestamp changes, independent
online results for a shared HTTP response, venue/tour relationship readers,
transaction rollback, stale responses, and account-scoped favorite refresh.

The dedicated simulator opened a generated schema-16 Realm with the API
unavailable and migrated to schema 23. It restored both queue occurrences and
selected the second at 42 seconds. Imported IDs, cached venue labels, history,
anonymous favorites, and the downloaded file survived; its SHA-256 matched the
source fixture. Playback opened that local file. The fixture is a quarter-second
audio sample, so its natural completion is separate from checkpoint restoration.

Native song browse remained readable offline, and opening song discovery showed
Connection Required. With a local API fixture using the current V4 shapes, the
song detail displayed its show and recording. After another offline restart,
artist venue detail displayed that cached show through `Show.artistVenue`, with
the imported venue label preserved. My Venues refreshed an existing
favorite A to survivor B, updated B's name while the list remained mounted, and
retained that learned name after an offline restart. Removing B's heart marked
the original saved A absent and created no B favorite.

Native fixture artifacts and logs are under `/tmp/relisten-relationships-*`;
the original dirty checkout is backed up in
`/tmp/relisten-before-relationship-simplification.tar.gz`. The frozen schema-16
upgrade and relationship assertions are also in the permanent test suite.
Native qualification used synthetic catalog data, not production mutations.
No Drums timing or capacity claim is made; a same-fixture device measurement
remains necessary before claiming a performance improvement. This work does not
establish release readiness for unrelated CarPlay, deep-link, or rollout work.
