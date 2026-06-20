# Ledger: Favorites Sync Migration

This ledger is the write-ahead log for `docs/workstreams/backlog/favorites-sync-migration/plan.md`.

## Experiments

### MOB-FAV-003 - Scoped favorite consumers for library and source selection

- Status: completed
- Timestamp: 2026-06-20T17:56:23Z
- Intention / hypothesis: Signed-in users should see scoped `UserFavorite` rows drive library/favorite sections and source-selection priority, while signed-out users keep the existing catalog `isFavorite` behavior during rollout.
- Responsible agent: root Codex agent
- Start commit: `e5aa1b3`
- End commit: this commit (`feat(favorites): use scoped library consumers`)
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: `relisten/realm/library_index.ts`, focused library/source/CarPlay favorite consumers, signal tests for scoped versus signed-out behavior, AutoPlan docs, and this ledger.
- Validator: `yarn test -- library-index favorite-sync`, `yarn test`, `yarn lint`, `yarn ts:check`, `git diff --check`, subagent review, and iOS Simulator smoke because React UI and CarPlay-facing source selection changed.
- Expected deliverable: shared scoped favorite lookup/index helpers; My Library, artist/source selection, and CarPlay favorite paths use scoped rows for authenticated scopes without regressing signed-out catalog-flag behavior.
- Expected artifacts: code diff, focused tests, validation transcript, simulator notes if needed, and review notes.
- Linked ExecPlan: none.
- Evidence:
  - `LibraryIndex` now computes effective favorite sets from active authenticated `UserFavorite` rows when signed in, and from legacy catalog `isFavorite` flags when anonymous/signed out.
  - Direct favorite predicates were added for artist/show/source/song/tour while library membership remains distinct from direct favorite state. Venue favorites remain legacy-only because venues are not part of the M1 server favorite contract.
  - Source favorites now make their parent show visible in library membership once the catalog `Source` row is available; the index listens for late-loaded catalog show/source relationship rows only while scoped favorites are active.
  - Offline availability remains separate from My Library membership: streaming cache rows count as offline availability, while only user-initiated downloads count as library downloads.
  - Artists tab favorites, My Library show sections, show row heart badges, source selection badges/default priority, source sorting, source detail favorite controls, CarPlay library source resolution, CarPlay artist favorites, song filtering, and tour library filtering now read through `LibraryIndex` or the shared scoped favorite hook instead of raw catalog booleans.
  - CarPlay year-show loading no longer prefilters library mode to legacy favorite/offline rows before scoped library membership can be applied.
  - `FavoriteObjectButton` and the custom source detail controls share `useCatalogFavoriteState`, so signed-in source/show toggles use scoped authenticated mutations while anonymous users keep catalog-flag fallback behavior.
- Validators:
  - `yarn test -- library-index`: pass, 1 file / 4 tests.
  - `yarn test -- library-index favorite-sync source_selection`: pass, 3 files / 16 tests.
  - `yarn test`: pass, 21 files / 160 tests.
  - `yarn ts:check`: pass.
  - `yarn lint`: pass.
  - `git diff --check`: pass.
  - iOS Simulator bundle/render smoke: pass on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`; screenshot artifact `/tmp/relisten-mob-fav-003-final-smoke.png`.
  - Follow-up live local API check initially found no listeners on `3823`/`5119`, so API thread `019ee12c-f057-7601-8e0b-9d77e22670a4` was asked to re-check/restart the dev servers.
  - After the restart, live local smoke passed at 2026-06-20T18:42:02Z: user-library `/health` returned 200, catalog `/api/v3/artists?include_autocreated=false` returned 200, Development session issue returned 200 with `Cache-Control: no-store`, bearer `/api/v3/library/users/me` returned 200 with `Cache-Control: no-store`, favorite `PUT /api/v3/library/favorites/artist/77a58ff9-2e01-c59c-b8eb-cff106049b72` returned 200, `GET /favorites` contained the smoke favorite, `DELETE /favorites/artist/...` returned 204, the next `GET /favorites` no longer contained it, and auth logout returned 204.
- Review: Reviewer `019ee642-a01c-7aa1-850b-2714a3b8c393` found the custom source detail favorite controls still bypassed scoped mutations and noted missing CarPlay source-selection coverage. Fixes added shared `useCatalogFavoriteState`, wired source detail controls through it, and added `source_selection.test.ts`.
- Outcome: pass
- next_action: done

### MOB-FAV-002 - Signed-in scoped favorite state and mutations

- Status: completed
- Timestamp: 2026-06-20T06:39:49Z
- Intention / hypothesis: Existing favorite UI can keep signed-out catalog flag behavior while signed-in favorite state reads from scoped `UserFavorite` rows and writes through authenticated user-library favorite endpoints with rollback on failed mutation.
- Responsible agent: root Codex agent
- Start commit: `854b41d`
- End commit: this commit, `feat(favorites): add scoped mutation path`
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: focused favorite state/mutation helpers under `relisten/user_library/`, `relisten/components/favorite_icon_button.tsx`, focused favorite tests, AutoPlan docs, and this ledger.
- Validator: `yarn test -- favorite`, `yarn test`, `yarn lint`, `yarn ts:check`, and `git diff --check`.
- Expected deliverable: reusable active-scope favorite state helpers, authenticated set/unset service using existing auth retry, rollback on failed mutations, and UI heart-button wiring for signed-in scoped reads without regressing signed-out catalog flags.
- Expected artifacts: code diff, focused tests, validation transcript, and review notes.
- Linked ExecPlan: none.
- Evidence: `FavoriteObjectButton` now reads active authenticated scopes from Realm, resolves supported catalog objects to server favorite entity types, displays scoped `UserFavorite` state for signed-in users, and keeps the old catalog `isFavorite` toggle for signed-out or unsupported objects. `UserLibraryFavoriteMutationService` performs optimistic scoped upsert/tombstone writes, calls authenticated user-library PUT/DELETE endpoints with bounded auth retry and expected-scope checking, applies server favorite responses, and restores the previous scoped row on network/auth failure. Runtime service construction is shared per Realm and does not create a sync runner from each row.
- Review: The requested subagent review was attempted, but the reviewer failed before producing findings because the Codex account usage limit was reached. Root performed a local correctness pass over the diff and neighboring Realm/query/auth client code; the only accepted gap was missing auth-session rollback coverage, so a focused missing-session rollback test was added. No token/full-URL/error-body logging path was found in this slice.
- Validators run: `yarn test -- favorite-sync` passed with 9 tests; `yarn test` passed with 19 files and 144 tests; `yarn ts:check` passed; `yarn lint` passed; `git diff --check` passed.
- Outcome: pass
- next_action: continue

### MOB-FAV-001 - Scoped favorite sync and local flag migration

- Status: completed
- Timestamp: 2026-06-20T04:40:24Z
- Intention / hypothesis: Mobile can preserve existing signed-out catalog favorite flags while copying them once into scoped `UserFavorite` rows and applying server favorite changes/tombstones using the server entity-type contract.
- Responsible agent: root Codex agent
- Start commit: `b017b93`
- End commit: pending commit for `feat(sync): add scoped favorite migration`
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: `relisten/realm/models/user_library/library.ts`, focused favorite sync/migration files under `relisten/user_library/`, sync applier support only if needed to avoid cursor skips, focused tests, AutoPlan docs, and this ledger.
- Validator: `yarn test -- favorite-sync playlist-sync`, `yarn test`, `yarn lint`, `yarn ts:check`, and `git diff --check`.
- Expected deliverable: server-aligned favorite entity types, scoped favorite upsert/tombstone helpers, one-time local catalog favorite migration into scoped rows with migration marker, and tests proving source/track/tour/song preservation and idempotency.
- Expected artifacts: code diff, focused tests, validation transcript, and review notes.
- Linked ExecPlan: none.
- Evidence: `UserFavoriteEntityType.Track` now matches the server `track` contract while inbound legacy `source_track` normalizes to `track`; favorite API helpers target `/favorites`; pull sync applies favorite changes and tombstones; the first supported pull sync copies existing catalog favorite flags into scoped rows with a `UserDataMigrationMarker`; unsupported resources or invalid favorite entities do not advance the cursor.
- Review: First subagent review found the local catalog favorite migration helper was not invoked by pull sync; the sync applier now runs migration before changes/tombstones and before cursor persistence. Follow-up review reported no findings. Reviewer-suggested rollback and unsupported favorite tombstone tests were added.
- Validators run: `yarn test -- favorite-sync playlist-sync` passed before docs update with 19 tests. Full `yarn test`, `yarn lint`, `yarn ts:check`, and `git diff --check` are pending the final commit gate.
- Outcome: pass
- next_action: continue
