# Ledger: Queue V2 Playback Foundation

This ledger is the write-ahead log for `docs/workstreams/active/queue-v2-playback-foundation/plan.md`.

## Experiments

### MOB-QUEUE-001 - Pure Queue V2 identity foundation

- Status: completed
- Timestamp: 2026-06-20T01:09:59Z
- Intention / hypothesis: Pure Queue V2 types and block-shuffle helpers can be introduced and tested before changing runtime playback behavior.
- Responsible agent: root Codex agent
- Start commit: `2deeea7`
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: new queue model/helper files under `relisten/player/`, queue tests, minimal current queue imports if needed, and AutoPlan docs.
- Validator: `yarn test -- queue-v2`, `yarn test`, `yarn lint`, `yarn ts:check`, `git diff --check`, and iOS Simulator smoke if runtime queue code changes.
- Expected deliverable: tested Queue V2 item identity, catalog item migration shape, duplicate playlist entry keying, history attribution metadata, and block shuffle grouping semantics.
- Expected artifacts: code diff, validation transcript, and review notes.
- Linked ExecPlan: none unless runtime integration expands beyond this foundation.
- Evidence:
  - Added pure Queue V2 catalog and playlist item types with explicit `queueItemId`s and a persisted shape aligned to the design contract: `schemaVersion`, `items`, `currentItemKey`, and shuffled queue item ids.
  - Added catalog migration helpers that convert existing source-track UUID queues into catalog Queue V2 items with deterministic occurrence ids.
  - Added playlist item helpers that distinguish duplicate source tracks by `playlistEntryUuid` and expose playlist history attribution.
  - Added block shuffle unit helpers that group by non-null `blockUuid`, keep standalone entries as their own units, and sort block internals by `blockPosition`.
  - Added focused tests for catalog migration, duplicate legacy current-key ambiguity, duplicate playlist source-track identity, playback cursor/history attribution, and block shuffle grouping.
- Validators:
  - `yarn test -- queue-v2`: pass, 1 file / 4 tests.
  - `yarn test`: pass, 6 files / 24 tests.
  - `yarn ts:check`: pass.
  - `yarn lint`: pass.
  - `git diff --check`: pass.
  - iOS Simulator smoke: not run because this slice added pure helpers only and did not touch runtime playback code.
- Review:
  - First-pass review found two integration risks: competing active item ids and numeric playlist position in the Queue V2 shape.
  - Addressed both by switching to one `currentItemKey`, adding a duplicate legacy ambiguity test, and removing playlist `position` from Queue V2.
  - Second-pass review found no actionable issues.
- Outcome: pass
- next_action: continue

### Next Experiment Template: MOB-QUEUE-001

- Timestamp: fill in before edits
- Intention / hypothesis: Pure Queue V2 types and block-shuffle helpers can be introduced and tested before changing the runtime player integration.
- Responsible agent: fill in before edits
- Start commit: fill in before edits
- Worktree or branch: fill in before edits
- Mutable surface: new queue model/helper files under `relisten/player/`, queue tests, and only minimal imports from current queue files.
- Validator: targeted Queue V2 tests, `yarn lint`, `yarn ts:check`.
- Expected deliverable: tested Queue V2 item identity, catalog item migration shape, and block shuffle grouping semantics.
- Expected artifacts: code diff and validation transcript.
- Linked ExecPlan: none unless runtime integration requires a larger staged migration.

Outcome entry must include end commit, artifact location, evidence summary, conclusion, `next_action`, and next move.
