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
