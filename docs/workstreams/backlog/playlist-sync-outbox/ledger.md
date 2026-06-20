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

### MOB-SYNC-003 - Authenticated sync lifecycle runner

- Status: completed
- Timestamp: 2026-06-20T05:11:09Z
- Intention / hypothesis: Mobile can mount a thin lifecycle component that runs pull sync plus operation replay only for the active authenticated scope, using the auth session service for refresh-on-401 and respecting network/foreground triggers.
- Responsible agent: root Codex agent
- Start commit: `18b80cc`
- End commit: this commit (`feat(sync): add authenticated sync lifecycle runner`)
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: focused user-library sync runner/provider/component files under `relisten/user_library/`, `app/_layout.tsx` only to mount the bootstrap component, focused tests, AutoPlan docs, and this ledger.
- Validator: `yarn test -- user-library-sync-runner auth-session playlist-operation-outbox playlist-sync`, `yarn test`, `yarn lint`, `yarn ts:check`, and `git diff --check`.
- Expected deliverable: auth-aware user-library client bundle, React-independent sync runner, lifecycle trigger component, tests for signed-out skip, refresh retry, outbox-before-pull ordering, and in-flight coalescing.
- Expected artifacts: code diff, focused tests, validation transcript, and review notes.
- Linked ExecPlan: none.
- Evidence: Added a React-independent `UserLibrarySyncRunner` that gates work on the active authenticated Realm scope, obtains expected-scope access tokens through `UserLibraryAuthSessionService.withAuthenticatedSessionRetry`, replays pending playlist operations before pulling `/sync`, persists the sync cursor through the existing applier, and coalesces overlapping runs while queueing a follow-up scope-change run.
- Lifecycle evidence: Mounted `UserLibrarySyncBootstrap` in the root app layout. It creates separate auth and user-library API clients, uses SecureStore-backed refresh token storage, triggers sync on mount/scope/network changes and foreground transitions, and stays non-visual.
- Safety evidence: Runner skips signed-out scopes, missing scopes, authenticated scopes without token material, stale scopes after sign-out/scope switches, and protected auth sessions whose server `scope_id` does not match the active Realm scope. Outbox replay now accepts explicit access tokens and cooperatively avoids applying a server operation response after the active scope changes.
- Validators: `yarn test -- auth-session user-library-sync-runner playlist-operation-outbox playlist-sync` passed with 56 focused tests; `yarn test` passed with 14 files / 100 tests; `yarn lint`; `yarn ts:check`; `git diff --check`.
- Review: First reviewer found stale-scope writes and dropped scope-change triggers during in-flight work. Fixes added active-scope rechecks, queued scope-change reruns, stale-scope outbox protection, and focused regression tests. Final reviewer found cached auth sessions could outlive the active user scope; fix added server-scope-aware protected sessions and mismatch skip coverage.
- Outcome: pass
- next_action: continue
- Next move: Trigger replay after future local playlist mutations and/or continue with scoped playback history batching; live local auth/sync smoke still depends on `RelistenUserApi` listening on `http://localhost:5119`.

### MOB-SYNC-004 - Live local sync and operation smoke

- Status: completed
- Timestamp: 2026-06-20T18:47:01Z
- Intention / hypothesis: The running local `RelistenUserApi` should accept the mobile sync read and playlist operation payload shapes used by the sync/outbox services.
- Responsible agent: root Codex agent
- Start commit: `a8b8fe3`
- End commit: this docs commit
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: docs only.
- Validator: direct local HTTP smoke against `http://localhost:5119`.
- Evidence: Issued a Development session for `relisten_mobile_smoke`; `GET /api/v3/library/sync` returned 200 with `Cache-Control: no-store`, `changes`, `tombstones`, and `next_cursor`. Then posted an `add_track` operation to disposable playlist `78b3cf6f-5709-4222-852a-233a2d7d6782` using real source track `3449118a-14c7-57b2-dedd-ddc236e03506`.
- Result: `POST /api/v3/library/playlists/{playlistUuid}/operations` returned 200 with `Cache-Control: no-store`, `result_status: applied`, `result_revision: 2`, a canonical playlist snapshot, and the requested entry UUID present. Logout returned 204.
- Outcome: pass
- next_action: continue
- Next move: Wire future playlist UI mutation adapters to the existing outbox/runner; the endpoint contract is live-smoked.
