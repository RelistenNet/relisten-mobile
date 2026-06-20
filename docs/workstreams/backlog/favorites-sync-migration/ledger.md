# Ledger: Favorites Sync Migration

This ledger is the write-ahead log for `docs/workstreams/backlog/favorites-sync-migration/plan.md`.

## Experiments

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
