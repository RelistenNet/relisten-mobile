# Ledger: Auth Session User Service Client

This ledger is the write-ahead log for `docs/workstreams/backlog/auth-session-user-service-client/plan.md`.

## Experiments

### MOB-AUTH-001 - Local auth session service foundation

- Status: completed
- Timestamp: 2026-06-20T04:12:24Z
- Intention / hypothesis: The mobile auth/session boundary can obtain real Development-only tokens from local `RelistenUserApi`, store refresh tokens in SecureStore, keep access tokens in memory, and provide one bounded refresh retry for user-library requests without coupling auth to the catalog client.
- Responsible agent: root Codex agent
- Start commit: `32559ab`
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: `relisten/user_library/` auth/session service files, `relisten/api/user_library_client.ts` only if a small retry seam is needed, focused auth tests, AutoPlan docs, and this ledger.
- Validator: `yarn test -- auth-session api-config`, `yarn test`, `yarn lint`, `yarn ts:check`, `git diff --check`, and local API smoke only if `RelistenUserApi` is running on `http://localhost:5119`.
- Expected deliverable: secure refresh-token store, typed auth DTOs, dev-session sign-in, refresh/logout calls, access-token provider, and bounded 401 refresh retry wrapper for user-library requests.
- Expected artifacts: code diff, validation transcript, review notes, and live local API smoke result or explicit no-listener evidence.
- Linked ExecPlan: none.
- End commit: this commit (`feat(auth): add user-library session foundation`)
- Artifacts: `relisten/user_library/auth_session.ts`, `relisten/user_library/auth_token_store.ts`, `relisten/user_library/auth-session.test.ts`.
- Evidence:
  - Added a separate `UserLibraryAuthSessionService` with typed token/session DTOs, SecureStore-backed refresh-token persistence, in-memory access token caching, Development-only session sign-in, refresh/logout calls, and one bounded protected-request retry after a 401.
  - Fixed review-identified edge cases before landing: sign-out invalidates in-flight refreshes by session generation, refresh-token 401s are not retried as protected request failures, access tokens are cached only after refresh tokens are durably stored, and Development session sign-in has a client-side dev gate.
  - Added focused tests for token storage, refresh rotation, bounded 401 retry, refresh-token invalidation, sign-out versus in-flight refresh, SecureStore write failure, and disabled dev-auth behavior.
  - `lsof -nP -iTCP:5119 -sTCP:LISTEN` produced no listener, so live local API auth smoke is deferred until `RelistenUserApi` is running.
- Validators:
  - `yarn test -- auth-session api-config`
  - `yarn test`
  - `yarn lint`
  - `yarn ts:check`
  - `git diff --check`
- Review: Initial subagent review found the sign-out/refresh race, refresh-token 401 retry bug, non-atomic token application, and missing dev gate. Follow-up review found no actionable code findings after fixes; it requested stale AutoPlan text cleanup, which was applied.
- Outcome: pass
- next_action: continue
- Next move: Wire auth session metadata and active-scope/bootstrap behavior, then run the local Development auth smoke when `RelistenUserApi` is listening on `http://localhost:5119`.

### MOB-AUTH-002 - Session metadata and active scope bridge

- Status: completed
- Timestamp: 2026-06-20T04:24:23Z
- Intention / hypothesis: Auth token responses can be persisted as non-secret Realm session metadata and used to switch the active user-data scope without coupling token storage to Realm or deleting signed-out rows.
- Responsible agent: root Codex agent
- Start commit: `9abc929`
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: new focused auth/session Realm bridge files under `relisten/user_library/`, focused tests, AutoPlan docs, and this ledger.
- Validator: `yarn test -- auth-session scope`, `yarn test`, `yarn lint`, `yarn ts:check`, and `git diff --check`.
- Expected deliverable: a React-independent service that applies sign-in/refresh token responses to `UserAuthSessionMetadata`, validates the server `scope_id` invariant, switches `ActiveUserDataScope`, and marks session metadata signed out while preserving scoped rows.
- Expected artifacts: code diff, focused tests, validation transcript, and review notes.
- Linked ExecPlan: none.
- End commit: this commit (`feat(auth): persist session metadata scope`)
- Artifacts: `relisten/user_library/auth_session_realm_service.ts`, `relisten/user_library/auth-session-realm.test.ts`.
- Evidence:
  - Added a React-independent Realm bridge that applies auth token responses to non-secret `UserAuthSessionMetadata` rows and switches `ActiveUserDataScope` to the authenticated `user:{user_uuid}` scope.
  - Validates the server `scope_id` invariant against the mobile authenticated scope helper before writing metadata or switching active scope.
  - Supports refresh-response bootstrap, preserves original authentication timestamps on refresh, marks sessions signed out, switches back to anonymous scope, and leaves signed-in scoped rows intact.
  - Rejects stale refresh responses for sessions already marked signed out.
- Validators:
  - `yarn test -- auth-session scope`
  - `yarn test`
  - `yarn lint`
  - `yarn ts:check`
  - `git diff --check`
- Review: Subagent review reported no findings. Suggested signal tests for cold refresh bootstrap and stale refresh after sign-out; both were added.
- Outcome: pass
- next_action: continue
- Next move: Promote playlist/favorites sync outbox work now that auth metadata and active scope switching are available.
