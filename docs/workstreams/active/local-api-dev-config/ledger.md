# Ledger: Local API Dev Config

This ledger is the write-ahead log for `docs/workstreams/active/local-api-dev-config/plan.md`.

## Experiments

### MOB-API-001 - Separate local API base config

- Status: completed
- Timestamp: 2026-06-20T00:44:27Z
- Intention / hypothesis: Separate API base URL config and a new user-library client can be added without changing catalog caching behavior.
- Responsible agent: root Codex agent
- Start commit: `b1cb20d`
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: `relisten/api/client.ts`, new `relisten/api/config.ts`, new `relisten/api/user_library_client.ts`, new `relisten/api/local_api_probe.ts`, targeted API config tests, focused local API docs, and AutoPlan docs.
- Validator: `yarn test -- api-config`, `yarn test`, `yarn lint`, `yarn ts:check`, and iOS Simulator launch on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`.
- Expected deliverable: explicit catalog and user-library base URL selection plus a user-library client skeleton that does not inherit catalog ETag/rate-limit caching or full-URL logging.
- Expected artifacts: code diff, validation transcript, and local iOS Simulator smoke notes.
- Linked ExecPlan: none.
- Evidence:
  - Added `relisten/api/config.ts` with explicit catalog and user-library base URLs, production defaults, local iOS Simulator constants, and static `process.env.EXPO_PUBLIC_*` reads for Expo bundling.
  - Changed `RelistenApiClient.API_BASE` to use the catalog config while leaving catalog request caching, request dedupe, ETag, retry, and logging behavior unchanged.
  - Added `RelistenUserLibraryApiClient` as a separate fetch-based user-library client for `/api/v3/library` paths, no-store headers, JSON mutations, and bearer-token injection via an external provider.
  - Added `runLocalApiBaseUrlProbe` for a development-only caller to verify selected catalog and user-library bases once local servers are running.
  - Added `docs/local-api-dev-config.md` with iOS Simulator env vars and probe notes.
  - Local ports `3823` and `5119` were not listening, so live server response smoke was not run.
- Validators:
  - `yarn test -- api-config`: pass, 1 file / 6 tests.
  - `yarn test`: pass, 4 files / 16 tests.
  - `yarn ts:check`: pass.
  - `yarn lint`: pass.
  - `git diff --check`: pass.
  - iOS Simulator smoke: pass on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D` with `EXPO_PUBLIC_RELISTEN_CATALOG_API_BASE_URL=http://localhost:3823/api` and `EXPO_PUBLIC_RELISTEN_USER_API_BASE_URL=http://localhost:5119` set before starting Metro.
- Review:
  - Code and plan subagents found a high-risk Expo env issue; fixed by using static dot-notation `process.env.EXPO_PUBLIC_*` reads in the default env snapshot.
  - Plan subagent noted a plain simulator launch was weaker than live request routing; added `runLocalApiBaseUrlProbe` and tests, and recorded that local servers were unavailable for live response smoke.
- Outcome: pass
- next_action: done

### MOB-API-002 - Live local API smoke and health probe correction

- Status: completed
- Timestamp: 2026-06-20T18:02:25Z
- Intention / hypothesis: Once the local API servers are healthy, the mobile local API probe should verify the real catalog and user-library base URLs without relying on a user-library route that is not present in the running API contract.
- Responsible agent: root Codex agent
- Start commit: `baf71ec`
- End commit: this commit (`fix(api): validate local user api health probe`)
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: `relisten/api/local_api_probe.ts`, `relisten/api/api-config.test.ts`, `docs/local-api-dev-config.md`, root AutoPlan docs, and this ledger.
- Validator: `yarn test -- api-config`, `yarn test`, `yarn lint`, `yarn ts:check`, `git diff --check`, direct local API smoke, and iOS Simulator Metro smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`.
- Expected deliverable: `runLocalApiBaseUrlProbe` uses the real user-library health endpoint and local docs no longer point developers at a 404ing username-check route.
- Expected artifacts: code diff, validation transcript, direct local API smoke notes, and iOS Simulator screenshot artifact.
- Linked ExecPlan: none.
- Evidence:
  - Changed the user-library side of `runLocalApiBaseUrlProbe` to call `GET /health` directly with `Accept: text/plain`, while keeping the catalog probe on `/v3/artists?include_autocreated=false`.
  - Updated the API config test and local API docs to match the running user API contract.
  - Direct local smokes returned 200 for catalog `/api/v3/artists?include_autocreated=false`, catalog `/api/v2/shows/today?month=6&day=20`, user-library `/health`, Development session issue, and authenticated `/api/v3/library/users/me`; unauthenticated `/users/me` returned the expected 401 with `Cache-Control: no-store`.
  - iOS Simulator Metro smoke used `EXPO_PUBLIC_RELISTEN_CATALOG_API_BASE_URL=http://localhost:3823/api` and `EXPO_PUBLIC_RELISTEN_USER_API_BASE_URL=http://localhost:5119`, bundled successfully, and served successful catalog requests from the running app.
- Validators:
  - `yarn test -- api-config`: pass, 1 file / 7 tests.
  - `yarn test`: pass, 19 files / 154 tests.
  - `yarn ts:check`: pass.
  - `yarn lint`: pass.
  - `git diff --check`: pass.
  - iOS Simulator smoke: pass on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`; screenshot artifact `/tmp/relisten-local-api-live-smoke.png`.
- Review: Root reviewed this as a narrow probe-contract correction. No additional abstraction is needed because the user-library client should remain library-prefix aware, while service `/health` is intentionally outside `/api/v3/library`.
- Outcome: pass
- next_action: done
- Next move: Resume `MOB-FAV-003` for scoped favorite consumers after this correction is committed.

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
