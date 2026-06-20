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

### MOB-SYNC-002 - Playlist operation outbox replay

- Status: completed
- Timestamp: 2026-06-20T04:53:38Z
- Intention / hypothesis: Mobile can persist idempotent playlist operations in `PendingUserOperation`, replay them against `POST /api/v3/library/playlists/{playlistUuid}/operations`, apply the canonical playlist response, and avoid replaying later same-playlist operations after an earlier failure.
- Responsible agent: root Codex agent
- Start commit: `9f2a914`
- End commit: pending commit for `feat(sync): add playlist operation outbox`
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: `relisten/user_library/playlist_operation_outbox.ts`, focused outbox tests, small reusable playlist snapshot applier changes in `relisten/user_library/playlist_sync.ts`, AutoPlan docs, and this ledger.
- Validator: `yarn test -- playlist-operation-outbox playlist-sync`, `yarn test`, `yarn lint`, `yarn ts:check`, and `git diff --check`.
- Expected deliverable: typed playlist operation DTOs, operation endpoint helper, pending operation enqueue/idempotency handling, replay status transitions, canonical playlist reconciliation, same-playlist failure skip behavior, and focused tests.
- Expected artifacts: code diff, focused tests, validation transcript, and review notes.
- Linked ExecPlan: none.
- Evidence: Added typed playlist operation DTOs and `postUserLibraryPlaylistOperation()`, enforced GUID-shaped server IDs before persistence/posting, stored stable operation JSON under `PendingUserOperation`, replayed pending operations in creation order, applied canonical playlist snapshots through the shared playlist applier, preserved existing viewer state when operation responses omit it, and guarded concurrent same-scope replay.
- Error handling evidence: Transient network/server/auth failures remain retryable as `failed`; deterministic non-auth 4xx and local validation/corrupt pending-operation JSON become non-replayable `blocked`; later same-playlist operations are skipped only for the current replay run and can proceed after the blocking operation is excluded.
- Validators run before final docs gate: `yarn test -- playlist-operation-outbox playlist-sync` passed with 27 focused tests; `yarn lint` and `yarn ts:check` passed. Full `yarn test` and `git diff --check` are pending the final commit gate.
- Review: First reviewer found permanent retry/starvation for deterministic 4xx, non-GUID test payloads, and overlapping replay risk. Fixes added `blocked` status, GUID validation, real GUID fixtures, fetch-level serialization coverage, and an in-process replay guard. Re-review found 401 auth failures were incorrectly terminal; fix keeps 401 retryable and added coverage.
- Outcome: pass
- next_action: continue
- Next move: Wire this React-independent replay service into the authenticated app lifecycle and foreground/reconnect hooks after choosing the sync runner boundary.
