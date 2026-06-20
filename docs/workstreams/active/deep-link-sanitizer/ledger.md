# Ledger: Deep-Link Sanitizer

This ledger is the write-ahead log for `docs/workstreams/active/deep-link-sanitizer/plan.md`.

## Experiments

### MOB-LINK-001 - Deep-link sanitizer foundation

- Status: completed
- Timestamp: 2026-06-20T00:56:32Z
- Intention / hypothesis: A pure sanitizer plus first-class route handling can prevent share/auth secrets from reaching `+not-found` logging or navigation serialization.
- Responsible agent: root Codex agent
- Start commit: `6928eb7`
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: `app/+not-found.tsx`, new link sanitizer helper, first-class placeholder playlist/auth routes, sanitizer tests, and AutoPlan docs.
- Validator: `yarn test -- sanitizer`, `yarn test`, `yarn lint`, `yarn ts:check`, and manual iOS Simulator link smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`.
- Expected deliverable: scrubbed fallback logging/navigation params plus owned playlist share and auth callback routes that do not log raw secrets.
- Expected artifacts: code diff, test output, and manual log review notes.
- Linked ExecPlan: none.
- Evidence:
  - Added a pure link sanitizer that classifies exact share/auth params (`t`, `auth_code`, `code`, `state`) and token-like param names, redacts them for logs, and removes them before fallback navigation forwarding.
  - Changed `app/+not-found.tsx` to log only redacted route strings and to pass sanitized fallback params to `/web`.
  - Added first-class placeholder routes for `/playlist/[playlistId]` and `/auth/callback` so known user-library share/auth links do not fall through to the generic unmatched route.
  - Added focused sanitizer tests for sensitive param classification, fallback navigation sanitization, log redaction, and cold/warm URL redaction.
  - Manual iOS Simulator smoke opened `relisten://playlist/example?t=codexSmokeShareTokenA123`, `relisten://auth/callback?auth_code=codexSmokeAuthCodeB456&state=codexSmokeStateC789`, and `https://relisten.net/playlist/example?t=codexSmokeHttpsTokenD012` on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`.
  - App-process log predicates for those marker strings returned no `Relisten` process entries. The HTTPS route UI showed `relisten.net/playlist/example` without the query token.
- Validators:
  - `yarn test -- sanitizer`: pass, 1 file / 4 tests.
  - `yarn test`: pass, 5 files / 20 tests.
  - `yarn ts:check`: pass.
  - `yarn lint`: pass.
  - `git diff --check`: pass.
- Review:
  - First-pass review subagent found no actionable issues.
  - Second-pass validation subagent found no actionable issues.
- Outcome: pass
- next_action: done

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
