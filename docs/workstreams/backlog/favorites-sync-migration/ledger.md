# Ledger: Favorites Sync Migration

This ledger is the write-ahead log for `docs/workstreams/backlog/favorites-sync-migration/plan.md`.

## Experiments

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
