# Ledger: Playlist Sync Outbox

This ledger is the write-ahead log for `docs/workstreams/backlog/playlist-sync-outbox/plan.md`.

## Experiments

### MOB-SYNC-001 - Pull sync playlist applier

- Status: completed
- Timestamp: 2026-06-20T04:31:11Z
- Intention / hypothesis: The mobile client can apply `/api/v3/library/sync` playlist changes and tombstones into scoped Realm rows and persist the sync cursor without implementing local mutation replay yet.
- Responsible agent: root Codex agent
- Start commit: `8a4355c`
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: `relisten/realm/models/user_library/` playlist fields and migrations if needed, new `relisten/user_library/` sync DTO/applier files, focused sync tests, AutoPlan docs, and this ledger.
- Validator: `yarn test -- playlist-sync`, `yarn test`, `yarn lint`, `yarn ts:check`, and `git diff --check`.
- Expected deliverable: typed user-library sync DTOs, scoped playlist/entry upsert logic, playlist tombstone handling, sync cursor persistence, and tests proving scope isolation and entry replacement.
- Expected artifacts: code diff, focused tests, validation transcript, and review notes.
- Linked ExecPlan: none.
- End commit: this commit (`feat(sync): apply playlist pull sync`)
- Artifacts: `relisten/user_library/playlist_sync.ts`, `relisten/user_library/playlist-sync.test.ts`, `relisten/realm/models/user_library/playlists.ts`, `relisten/realm/schema.ts`.
- Evidence:
  - Added typed sync DTOs and `pullUserLibrarySync()` for `GET /api/v3/library/sync`.
  - Added a scoped playlist sync applier that upserts playlist snapshots, stores server `short_id`, viewer state, owner/current revision fields, replaces entries from full server snapshots, and persists the scoped sync cursor after successful application.
  - Treats `playlist` and `playlist_access` tombstones as local soft-delete markers for playlists and entries.
  - Preflights unsupported resource types before mutating rows or advancing the global cursor, so later favorite/settings/collaborator slices cannot be skipped.
  - Bumped Realm schema version to 16 for additive optional playlist sync metadata fields and added a v15-to-v16 open smoke.
- Validators:
  - `yarn test -- playlist-sync`
  - `yarn test`
  - `yarn lint`
  - `yarn ts:check`
  - `git diff --check`
- Review: Subagent review reported no findings. Suggested tests for mixed-response preflight, direct `playlist` tombstones, and v15-to-v16 schema upgrade smoke were added.
- Outcome: pass
- next_action: continue
- Next move: Add operation serialization/outbox replay or promote favorites migration now that pull sync application exists.
