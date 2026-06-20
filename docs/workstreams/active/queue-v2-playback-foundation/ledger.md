# Ledger: Queue V2 Playback Foundation

This ledger is the write-ahead log for `docs/workstreams/active/queue-v2-playback-foundation/plan.md`.

## Experiments

No implementation experiment has been claimed yet.

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
