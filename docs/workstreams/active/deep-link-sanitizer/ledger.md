# Ledger: Deep-Link Sanitizer

This ledger is the write-ahead log for `docs/workstreams/active/deep-link-sanitizer/plan.md`.

## Experiments

No implementation experiment has been claimed yet.

### Next Experiment Template: MOB-LINK-001

- Timestamp: fill in before edits
- Intention / hypothesis: A pure sanitizer plus first-class route handling can prevent share/auth secrets from reaching `+not-found` logging or navigation serialization.
- Responsible agent: fill in before edits
- Start commit: fill in before edits
- Worktree or branch: fill in before edits
- Mutable surface: `app/+not-found.tsx`, new linking/sanitizer helpers, optional route files, sanitizer tests.
- Validator: targeted sanitizer tests once available, `yarn lint`, `yarn ts:check`.
- Expected deliverable: scrubbed cold/warm link handling for playlist share tokens and auth callback params.
- Expected artifacts: code diff, test output, and manual log review notes if simulator validation is run.
- Linked ExecPlan: none unless route ownership becomes broader than expected.

Outcome entry must include end commit, artifact location, evidence summary, conclusion, `next_action`, and next move.
