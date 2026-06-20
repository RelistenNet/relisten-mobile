# Ledger: Local API Dev Config

This ledger is the write-ahead log for `docs/workstreams/active/local-api-dev-config/plan.md`.

## Experiments

No implementation experiment has been claimed yet.

### Next Experiment Template: MOB-API-001

- Timestamp: fill in before edits
- Intention / hypothesis: Separate API base URL config and a new user-library client can be added without changing catalog caching behavior.
- Responsible agent: fill in before edits
- Start commit: fill in before edits
- Worktree or branch: fill in before edits
- Mutable surface: `relisten/api/client.ts`, new `relisten/api/config.ts`, new `relisten/api/user_library_client.ts`, optional docs/tests.
- Validator: `yarn ts:check`, `yarn lint`, and targeted API config tests once the harness exists.
- Expected deliverable: explicit catalog and user-library base URL selection plus a user-library client skeleton that does not inherit catalog ETag/rate-limit caching.
- Expected artifacts: code diff, validation transcript, and local iOS Simulator smoke notes when server endpoint is available.
- Linked ExecPlan: none unless the implementation slice grows beyond this plan.

Outcome entry must include end commit, artifact location, evidence summary, conclusion, `next_action`, and next move.
