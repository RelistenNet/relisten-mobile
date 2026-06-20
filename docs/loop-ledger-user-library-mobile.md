# Root Loop Ledger: User Library Mobile Components

This ledger records root-level coordination for `docs/autoplan-user-library-mobile.md`. It is not a diary of every code experiment; detailed implementation work belongs in each workstream ledger.

## Iterations

### Iteration 1

- Timestamp: 2026-06-19T23:43:40Z
- Hypothesis: A root AutoPlan plus workstream package will keep the mobile user-library implementation scoped across independent local API, testing, link handling, playback, Realm, auth, sync, history, Cast/CarPlay, and UX branches.
- Action: Created the root AutoPlan package under `docs/`, chose `docs/autoplan-user-library-mobile.md` and `docs/loop-ledger-user-library-mobile.md` as the root pair, and created workstream directories under `docs/workstreams/`.
- Evidence: Root AutoPlan names the design source, acceptance evidence, mutable surface, milestones, active/backlog workstream board, user decisions, and local API target.
- Verdict: pass
- Next Action: continue
- Next move: Start `local-api-dev-config` and `test-harness-foundation` before editing playback, Realm, or auth/session code.

### Iteration 2

- Timestamp: 2026-06-19T23:43:40Z
- Hypothesis: The API server thread should receive the local mobile auth requirement before mobile implementation assumes a local token endpoint.
- Action: Sent follow-up steering to Codex thread `019ee12c-f057-7601-8e0b-9d77e22670a4`, asking for a Development-only local auth path in `RelistenUserApi`.
- Evidence: `send_message_to_thread` accepted the target thread id and prompt. The root AutoPlan records the dependency and expected local URL `http://localhost:5119`.
- Verdict: pass
- Next Action: continue
- Next move: Keep mobile implementation blocked from claiming full local auth smoke until the API thread lands or documents the dev auth endpoint.

### Iteration 3

- Timestamp: 2026-06-20T00:18:16Z
- Hypothesis: The scoped Realm foundation can proceed before full auth if it is limited to additive scoped models, stable scope identifiers, active scope switching, and signal tests.
- Action: Switched to branch `codex/scoped-realm-user-data`, promoted `scoped-realm-user-data` from backlog to active, and assigned the branch to supply the minimal test harness required by the scoped validators.
- Evidence: Root board now points to `docs/workstreams/active/scoped-realm-user-data/plan.md` and `docs/workstreams/active/scoped-realm-user-data/ledger.md`. The workstream ledger preregisters `MOB-SCOPE-001` before Realm schema edits.
- Verdict: pass
- Next Action: continue
- Next move: Implement the additive Realm schema, active scope service, scoped query helpers, and targeted `yarn test -- scope` coverage.

### Iteration 4

- Timestamp: 2026-06-20T00:34:01Z
- Hypothesis: Additive scoped Realm rows and a small active scope service are enough to complete the scoped user-data foundation without waiting for full auth or sync.
- Action: Implemented the scoped Realm model bundle, active scope helpers, minimal Vitest harness, and signal tests. Ran validators and iOS Simulator smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`; incorporated subagent review by adding a complete user-library model bundle Realm-open test.
- Evidence: `yarn test -- scope`, `yarn test`, `yarn ts:check`, `yarn lint`, and `git diff --check` passed. Metro bundled the app and the simulator loaded the Relisten UI with Realm path logged under the target simulator data container.
- Verdict: pass
- Next Action: done
- Next move: Commit the scoped Realm branch, then resume local API config/test harness/auth-session workstreams.

### Iteration 5

- Timestamp: 2026-06-20T00:44:27Z
- Hypothesis: The next useful slice is local API dev config plus API config tests, because scoped Realm is done and auth/session depends on clean base URL/client separation.
- Action: Claimed `MOB-API-001` in `local-api-dev-config` and `MOB-TEST-001` continuation in `test-harness-foundation` on branch `codex/scoped-realm-user-data`.
- Evidence: Both workstream ledgers had preregistered entries with mutable surfaces and validators before API config edits.
- Verdict: pass
- Next Action: continue
- Next move: Implement explicit catalog/user-library base URL config, separate user-library client skeleton, and targeted API config tests.

### Iteration 6

- Timestamp: 2026-06-20T00:54:51Z
- Hypothesis: Local API dev config and the test-harness continuation are complete when static Expo env refs select separate bases, the catalog client keeps its caching path, the user-library client is separate/no-store, and targeted tests prove the route construction.
- Action: Added explicit API config, `RelistenUserLibraryApiClient`, `runLocalApiBaseUrlProbe`, API config tests, and local API docs. Re-ran validators and simulator smoke with local env vars. Addressed subagent findings about Expo env inlining and weak live-smoke evidence.
- Evidence: `yarn test -- api-config`, `yarn test`, `yarn ts:check`, `yarn lint`, and `git diff --check` passed. The iOS Simulator loaded the app with local env vars set. No local API servers were listening on ports `3823` or `5119`, so live response probing is deferred until those processes are running.
- Verdict: pass
- Next Action: done
- Next move: Commit the local API config/test harness slice, then continue with `deep-link-sanitizer`.

### Iteration 7

- Timestamp: 2026-06-20T00:56:32Z
- Hypothesis: The deep-link security slice can proceed now that Vitest exists and local API config is committed.
- Action: Claimed `MOB-LINK-001` in `deep-link-sanitizer` on branch `codex/scoped-realm-user-data`.
- Evidence: The workstream ledger now has a preregistered entry with mutable surface and validators before route/sanitizer edits.
- Verdict: pass
- Next Action: continue
- Next move: Add pure sanitizer tests, remove raw fallback param logging, and add first-class placeholder routes for playlist share/auth callback links.

### Iteration 8

- Timestamp: 2026-06-20T01:07:02Z
- Hypothesis: A pure sanitizer plus first-class placeholder routes can prevent playlist share/auth secrets from reaching fallback logs, navigation serialization, and visible error/loading UI.
- Action: Added the sanitizer, focused tests, scrubbed `+not-found`, playlist/auth placeholder routes, iOS deep-link smoke, and two-pass subagent review.
- Evidence: `yarn test -- sanitizer`, `yarn test`, `yarn ts:check`, `yarn lint`, and `git diff --check` passed. Simulator smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D` opened playlist, auth callback, and HTTPS playlist links with marker secrets; app-process log predicates returned no marker values and HTTPS UI omitted the query token.
- Verdict: pass
- Next Action: done
- Next move: Commit `MOB-LINK-001`, then claim `queue-v2-playback-foundation` experiment `MOB-QUEUE-001`.

### Iteration 9

- Timestamp: 2026-06-20T01:09:59Z
- Hypothesis: Queue V2 should start as pure identity, serialization, and block-shuffle helpers before touching the runtime player queue.
- Action: Claimed `MOB-QUEUE-001` in `queue-v2-playback-foundation` on branch `codex/scoped-realm-user-data`.
- Evidence: The workstream ledger now has a preregistered entry with mutable surface and validators before queue model edits.
- Verdict: pass
- Next Action: continue
- Next move: Add pure Queue V2 item types/helpers and tests for catalog migration, duplicate playlist entry identity, history attribution, and block shuffle grouping.

### Iteration 10

- Timestamp: 2026-06-20T01:17:21Z
- Hypothesis: A pure Queue V2 model can lock item identity, catalog migration, cursor/history attribution, and block shuffle semantics without touching runtime playback code.
- Action: Added Queue V2 helpers and focused tests. Addressed reviewer findings by using one `currentItemKey`, adding duplicate legacy migration coverage, and removing numeric playlist position from the queue item shape.
- Evidence: `yarn test -- queue-v2`, `yarn test`, `yarn ts:check`, `yarn lint`, and `git diff --check` passed. First-pass review findings were fixed; second-pass review found no actionable issues.
- Verdict: pass
- Next Action: continue
- Next move: Commit `MOB-QUEUE-001`, then continue Queue V2 by integrating the pure model with persisted `PlayerState` and catalog queue construction.

### Iteration 11

- Timestamp: 2026-06-20T01:20:18Z
- Hypothesis: Queue V2 can be persisted additively beside legacy source-track state and used for catalog restore identity without changing catalog playback behavior.
- Action: Claimed `MOB-QUEUE-002` in `queue-v2-playback-foundation` on branch `codex/scoped-realm-user-data`.
- Evidence: The workstream ledger now has a preregistered entry with Realm/player mutable surface and simulator smoke validator before runtime edits.
- Verdict: pass
- Next Action: continue
- Next move: Add Queue V2 fields to `PlayerState`, write catalog Queue V2 state from the current queue, prefer Queue V2 current key during restore, and smoke app startup.

### Iteration 12

- Timestamp: 2026-06-20T01:32:26Z
- Hypothesis: Additive Queue V2 persistence can be wired through catalog save/restore without changing catalog playback behavior or breaking legacy queue fields.
- Action: Added Queue V2 `PlayerState` fields, schema version 14, catalog Queue V2 save/restore integration, pure restore-plan tests, and player-state persistence tests.
- Evidence: `yarn test -- queue-v2 player_state`, `yarn test`, `yarn ts:check`, `yarn lint`, and `git diff --check` passed. Simulator smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D` launched after schema bump, started catalog playback, wrote Queue V2 state, and relaunched with restore logs showing `queueV2CurrentItemKey` and Queue V2 schema version 2.
- Verdict: pass
- Next Action: continue
- Next move: Commit `MOB-QUEUE-002`, then continue Queue V2 toward playlist queue construction or promote auth/session if the API dev-auth endpoint is ready.

### Iteration 13

- Timestamp: 2026-06-20T01:36:45Z
- Hypothesis: Runtime queue tracks can carry Queue V2 item metadata through existing catalog playback APIs without changing current playback behavior.
- Action: Claimed `MOB-QUEUE-003` in `queue-v2-playback-foundation` on branch `codex/scoped-realm-user-data`.
- Evidence: The workstream ledger now has a preregistered entry with queue construction mutable surface and simulator smoke validator before runtime metadata edits.
- Verdict: pass
- Next Action: continue
- Next move: Add Queue V2 item metadata to `PlayerQueueTrack`, update catalog queue construction call sites, and smoke catalog playback.

### Iteration 14

- Timestamp: 2026-06-20T01:54:34Z
- Hypothesis: Runtime Queue V2 metadata can be carried by catalog queue tracks while persistence remains duplicate-safe for legacy restore, source-screen playback, CarPlay, incremental inserts, and re-queued rows.
- Action: Added Queue V2 item metadata to `PlayerQueueTrack`, batched catalog queue construction for source-screen and CarPlay paths, save-time Queue V2 normalization, cloned queue inserts, migrated legacy restore items, and stale legacy fallback coverage.
- Evidence: `yarn test -- queue-v2 player_state`, `yarn test`, `yarn ts:check`, `yarn lint`, and `git diff --check` passed. Simulator smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D` started source-page catalog playback from the current Metro bundle; screenshot artifact `/tmp/relisten-queue-v2-runtime-metadata-final-smoke.png`. Three reviewer passes found and then validated fixes for duplicate catalog ids, runtime track aliasing, and stale legacy active-index fallback.
- Verdict: pass
- Next Action: continue
- Next move: Commit `MOB-QUEUE-003`, then continue Queue V2 with playlist queue construction or promote auth/session if the local dev-auth endpoint is ready.

### Iteration 15

- Timestamp: 2026-06-20T01:57:39Z
- Hypothesis: Playlist queue construction can be added without playlist UI by mapping scoped playlist entries into Queue V2 playlist items and hydrated runtime queue tracks.
- Action: Claimed `MOB-QUEUE-004` in `queue-v2-playback-foundation` on branch `codex/scoped-realm-user-data`.
- Evidence: The workstream ledger now has a preregistered entry with playlist entry position, Queue V2 construction, focused tests, review, and simulator smoke validators before edits.
- Verdict: pass
- Next Action: continue
- Next move: Correct playlist entry position to the fractional string contract, add pure playlist Queue V2 construction helpers, and expose hydrated runtime queue construction for future playlist UI/sync callers.

### Iteration 16

- Timestamp: 2026-06-20T02:07:18Z
- Hypothesis: Playlist Queue V2 construction can land without playlist UI by keeping ordering and playable filtering pure, while preserving existing catalog playback after the Realm schema bump.
- Action: Changed playlist entry position storage to strings, added schema version 15 migration coverage, added pure playlist Queue V2 construction and playable hydrated item filtering, and exposed `PlayerQueueTrack.fromPlaylistEntries` for future playlist callers.
- Evidence: `yarn test -- queue-v2 scoped_user_library_models`, `yarn test`, `yarn ts:check`, `yarn lint`, and `git diff --check` passed. Simulator smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D` loaded schema version 15 and started source-page catalog playback; screenshot artifact `/tmp/relisten-queue-v2-playlist-construction-smoke.png`. Subagent review found and validated the migration guard for old catalog-only Realms.
- Verdict: pass
- Next Action: continue
- Next move: Commit `MOB-QUEUE-004`, then promote CarPlay/Cast playlist identity or auth/session depending on server dev-auth readiness.

### Iteration 17

- Timestamp: 2026-06-20T02:08:41Z
- Hypothesis: Cast queue payloads can carry Queue V2 item identity through `customData` without native module changes.
- Action: Claimed `MOB-CAST-001` in `carplay-cast-playlist-identity` on branch `codex/scoped-realm-user-data`.
- Evidence: The workstream ledger now has a preregistered entry with Cast adapter mutable surface and test validators before code edits.
- Verdict: pass
- Next Action: continue
- Next move: Add a pure Queue V2 Cast custom-data adapter, use it from Cast queue item construction, and test catalog plus playlist payloads.

### Iteration 18

- Timestamp: 2026-06-20T04:10:27Z
- Hypothesis: Cast queue-item custom data can carry Queue V2 identity while media-info custom data preserves the legacy runtime identifier used by existing Cast reconciliation.
- Action: Added native-free Cast Queue V2 payload helpers, wired top-level `MediaQueueItem.customData` in `cast_driver.ts`, kept legacy `mediaInfo.customData`, and added focused custom-data tests.
- Evidence: `yarn test -- cast-queue-v2 queue-v2`, `yarn test`, `yarn ts:check`, `yarn lint`, and `git diff --check` passed. Subagent review found and then validated the fix for queue-item versus media-info custom-data placement. Live Cast receiver validation remains deferred because no Cast device/session is available here.
- Verdict: pass
- Next Action: continue
- Next move: Commit `MOB-CAST-001`, then continue with auth/session if server dev-auth readiness can be confirmed or defer remaining CarPlay identity until playlist playback UI exists.

### Iteration 19

- Timestamp: 2026-06-20T04:12:24Z
- Hypothesis: Mobile auth/session can now be promoted because the local API repo contains the Development/Test-only token endpoint at `/api/v3/library/auth/development/session`.
- Action: Claimed `MOB-AUTH-001` in `auth-session-user-service-client` on branch `codex/scoped-realm-user-data`.
- Evidence: Local API source and tests show `AuthController.DevelopmentSession` and `DevelopmentSession_ShouldIssueRealTokensInDevelopment`; the mobile ledger now has a preregistered entry before auth service edits.
- Verdict: pass
- Next Action: continue
- Next move: Add secure refresh-token storage, typed auth DTOs, dev-session sign-in, refresh/logout calls, access-token provider, and bounded 401 retry tests.

### Iteration 20

- Timestamp: 2026-06-20T04:24:17Z
- Hypothesis: `MOB-AUTH-001` can land as the local auth-session foundation if token persistence, refresh retry, sign-out, and dev-gate edge cases are covered by focused tests and fresh review.
- Action: Added the auth session service, SecureStore refresh-token store, and auth tests; fixed reviewer-identified race and retry bugs before closing the slice.
- Evidence: `yarn test -- auth-session api-config`, `yarn test`, `yarn lint`, `yarn ts:check`, and `git diff --check` passed. Initial review found sign-out/refresh race, refresh-token 401 retry, token persistence atomicity, and dev-gate issues; follow-up review found no actionable code findings. `lsof -nP -iTCP:5119 -sTCP:LISTEN` produced no listener, so live local API auth smoke remains deferred.
- Verdict: pass
- Next Action: continue
- Next move: Commit `MOB-AUTH-001`, then continue with auth bootstrap/active-scope wiring or the next scoped user-data sync slice. Use the out-of-band Google OAuth client configs only through deliberate local configuration; do not commit downloaded config files.

### Iteration 21

- Timestamp: 2026-06-20T04:29:39Z
- Hypothesis: Auth token responses can drive non-secret Realm session metadata and active scope switching without coupling token storage to Realm or deleting signed-in scoped rows.
- Action: Added `UserLibraryAuthSessionRealmService`, focused Realm tests, and closed `MOB-AUTH-002`.
- Evidence: `yarn test -- auth-session scope`, `yarn test`, `yarn lint`, `yarn ts:check`, and `git diff --check` passed. Subagent review reported no findings; suggested cold-refresh and stale-refresh tests were added.
- Verdict: pass
- Next Action: continue
- Next move: Commit `MOB-AUTH-002`, then promote a scoped sync slice, starting with playlist sync/outbox unless API contract inspection shows favorites migration is the narrower next step.

## Root Coordination Notes

- The active set intentionally starts with foundations: local API config, deterministic test harness, deep-link sanitizer, and Queue V2 playback foundation.
- The playlist UX workstream is backlog with `next_action: ask_user` because it needs another grill-me pass after auth and basic user-data paths exist.
- Before using Git worktrees, create or switch to a `codex/...` branch for the active workstream and record it in the root board and workstream ledger.
- After each foundational slice, run `yarn lint` and `yarn ts:check`; once the test harness exists, also run the relevant targeted JS/TS tests.
- Google OAuth client files were provided out of band for future auth work. Do not commit downloaded client files or local absolute secret paths as part of this scoped Realm branch.
