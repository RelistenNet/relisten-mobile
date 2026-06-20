# Ledger: History Batch Upload Migration

## Experiments

### MOB-HIST-001 - Scoped history journal and batch client

- Status: completed
- Timestamp: 2026-06-20T05:37:41Z
- Intention / hypothesis: Mobile can persist new authenticated playback events into the existing scoped history Realm model and build deterministic `POST /api/v3/library/history/batch` payloads without changing signed-out playback reporting yet.
- Responsible agent: root Codex agent
- Start commit: `f79ef79`
- End commit: this commit (`feat(history): add scoped batch upload foundation`)
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: `relisten/realm/models/user_library/history.ts`, new focused `relisten/user_library/` history repository/client helpers and tests, AutoPlan docs, and this ledger.
- Validator: `yarn test -- history auth-session user-library-sync-runner`, `yarn test`, `yarn lint`, `yarn ts:check`, and `git diff --check`.
- Expected deliverable: typed history batch DTOs, scoped local journal enqueue/list/mark transitions, playlist attribution serialization from Queue V2-compatible inputs, and tests for scope isolation, idempotency, history-disabled/no-op behavior at the repository boundary, and endpoint payload shape.
- Expected artifacts: code diff, focused tests, validation transcript, and review notes.
- Linked ExecPlan: none.
- Artifacts: `relisten/user_library/playback_history_batch.ts`, `relisten/user_library/playback-history-batch.test.ts`, `relisten/realm/models/user_library/history.ts`, `relisten/player/queue_v2.ts`.
- Evidence: Added typed history batch DTOs, a `POST /history/batch` client helper using the separate user-library API client, a scoped playback-history repository for idempotent journal writes/listing/status transitions, and deterministic payload construction for batch uploads.
- Safety evidence: Authenticated history-disabled scopes no-op at the repository boundary, scoped rows stay isolated by `scopeId`, repeated `clientEventUuid` writes are idempotent only for identical data, invalid GUIDs and partial playlist attribution are rejected before persistence/posting, and signed-out `/api/v2/live/play` reporting remains untouched.
- Queue evidence: Queue V2 playlist items now expose optional block UUID/position in history attribution, and `ScopedPlaybackHistoryEntry` stores those optional fields under additive Realm schema version 17.
- Validators: `yarn test -- playback-history-batch queue-v2 scoped_user_library_models` passed with 4 files / 30 tests; `yarn test` passed with 15 files / 108 tests; `yarn ts:check`; `yarn lint`; `git diff --check`.
- Review: Subagent review checked the mobile diff plus server DTO/service alignment and reported no findings.
- Outcome: pass
- next_action: continue
- Next move: Wire the playback history reporter to record authenticated events into the scoped journal and add a runner that uploads batchable rows with protected user-library sessions.

### MOB-HIST-002 - Reporter journal writes and batch upload runner

- Status: completed
- Timestamp: 2026-06-20T05:46:48Z
- Intention / hypothesis: Mobile can journal signed-in playback events from the existing playback reporter, preserve signed-out anonymous reporting behavior, and flush batchable scoped history rows through the authenticated sync runner without adding a second auth lifecycle.
- Responsible agent: root Codex agent
- Start commit: `d2eb43f`
- End commit: this commit (`feat(history): wire authenticated batch uploads`)
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: `relisten/playback_history_reporter.ts`, `relisten/components/playback_history_reporter.tsx`, `relisten/user_library/` history recording/upload helpers and sync runner/bootstrap tests, AutoPlan docs, and this ledger.
- Validator: `yarn test -- playback-history user-library-sync-runner playback-history-batch`, `yarn test`, `yarn lint`, `yarn ts:check`, and `git diff --check`.
- Expected deliverable: authenticated scoped journal writes from Queue V2 playback attribution, protected batch flushing inside the existing sync runner, pending-history lifecycle trigger, and tests for signed-out preservation, stale-scope safety, refresh-on-401, and failed upload status transitions.
- Expected artifacts: code diff, focused tests, validation transcript, and review notes.
- Linked ExecPlan: none.
- Artifacts: `relisten/playback_history_reporter.ts`, `relisten/user_library/playback_history_recording.ts`, `relisten/user_library/playback_history_batch.ts`, `relisten/user_library/user_library_sync_runner.ts`, `relisten/user_library/user_library_sync_bootstrap.tsx`.
- Evidence: The existing playback reporter still writes local `PlaybackHistoryEntry` rows and still reports anonymous `/api/v2/live/play` events, then opportunistically writes scoped authenticated history rows when the active scope is authenticated and has non-secret session metadata with a server device ID.
- Upload evidence: The authenticated sync runner now flushes scoped playback history batches after pending playlist operation replay and before pull sync, using the same expected-scope protected session and 401 refresh retry path. The upload service drains more than one 500-row server batch per run, excludes rows already attempted during the same flush, preserves retryability for non-auth failures, and marks stale-scope uploads failed before skipping further sync work.
- Lifecycle evidence: `UserLibrarySyncBootstrap` observes pending scoped history rows for the active scope and triggers a `history` sync run while preserving existing mount/scope/network/foreground triggers.
- Validators: `yarn test -- playback-history-batch user-library-sync-runner playback-history-recording` passed with 3 files / 26 tests; `yarn test` passed with 16 files / 118 tests; `yarn lint`; `yarn ts:check`; `git diff --check`.
- Review: Reviewer found a multi-batch backlog stall risk after the first 500 rows; fix added same-run batch draining plus a 501-row regression test. Re-review reported no findings.
- Outcome: pass
- next_action: continue
- Next move: Keep old local history bulk-upload as a product decision; continue remaining mobile foundation workstreams before playlist UX.
