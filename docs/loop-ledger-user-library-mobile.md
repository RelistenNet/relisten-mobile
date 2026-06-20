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

### Iteration 22

- Timestamp: 2026-06-20T04:38:55Z
- Hypothesis: Playlist pull-sync can land before operation replay if it applies only fully supported resources and refuses to advance the global cursor when unsupported favorite/settings/collaborator resources are present.
- Action: Added typed sync DTOs, playlist snapshot/tombstone Realm application, guarded cursor persistence, schema version 16 optional playlist sync fields, and focused tests.
- Evidence: `yarn test -- playlist-sync`, `yarn test`, `yarn lint`, `yarn ts:check`, and `git diff --check` passed. Subagent review found no defects; suggested mixed-response, direct tombstone, and v15-to-v16 migration tests were added.
- Verdict: pass
- Next Action: continue
- Next move: Commit `MOB-SYNC-001`, then choose between playlist operation replay and favorites migration based on the narrowest next acceptance gap.

### Iteration 23

- Timestamp: 2026-06-20T04:50:49Z
- Hypothesis: Favorites can join pull sync now if mobile preserves signed-out catalog flags, maps mobile `SourceTrack` favorites to the server `track` entity, and migrates existing catalog flags into scoped rows only once per authenticated scope.
- Action: Added favorite API helpers, scoped favorite change/tombstone application, one-time catalog flag migration with a marker, pull-sync integration, and focused tests for source/track normalization, rollback, tombstones, and idempotency.
- Evidence: `yarn test -- favorite-sync playlist-sync` passed with 19 tests before final docs-gate validation. First review found the migration helper was not invoked from pull sync; the applier now runs it before changes/tombstones and cursor persistence. Follow-up review found no defects and suggested rollback/tombstone tests, which were added.
- Verdict: pass
- Next Action: continue
- Next move: Commit `MOB-FAV-001`, then continue `playlist-sync-outbox` with operation serialization and replay.

### Iteration 24

- Timestamp: 2026-06-20T05:08:55Z
- Hypothesis: Playlist operation replay can land as a React-independent service if pending rows keep stable idempotency keys and the replay path applies only canonical server playlist snapshots back into Realm.
- Action: Added the playlist operation outbox DTOs, endpoint helper, pending-operation repository, replay service, shared playlist snapshot applier, `blocked` terminal sync status, and focused outbox tests.
- Evidence: `yarn test -- playlist-operation-outbox playlist-sync` passed with 27 focused tests before final docs-gate validation. First review found deterministic 4xx starvation, non-GUID test/payload acceptance, and overlapping replay risks; fixes added GUID validation, real GUID fixtures, terminal `blocked` state, fetch-level serialization coverage, and same-scope replay guarding. Re-review found 401s were incorrectly terminal; the final fix keeps auth failures retryable and covers corrupt local JSON separately from malformed server responses.
- Verdict: pass
- Next Action: continue
- Next move: Commit `MOB-SYNC-002`, then choose the authenticated sync runner/lifecycle boundary or promote scoped playback history.

### Iteration 25

- Timestamp: 2026-06-20T17:25:09Z
- Hypothesis: The favorites workstream can advance another concrete source-of-truth slice by moving reusable signed-in favorite buttons to scoped rows and authenticated mutations while keeping signed-out catalog flags intact.
- Action: Completed `MOB-FAV-002`, updated the favorites workstream plan/ledger, and refreshed the root AutoPlan board to show the remaining source/show/library-index favorite-read gap. Attempted the requested subagent review, but the reviewer failed before returning findings because the Codex account usage limit was reached; root performed a local correctness pass and added missing-session rollback coverage.
- Evidence: `yarn test -- favorite-sync` passed with 9 tests; `yarn test` passed with 19 files and 144 tests; `yarn ts:check`, `yarn lint`, and `git diff --check` passed.
- Verdict: pass
- Next Action: continue
- Next move: Claim the next favorites slice for source/show/library selection paths unless live local API servers are available first.

### Iteration 26

- Timestamp: 2026-06-20T17:52:24Z
- Hypothesis: A branch-wide review after the usage-limit reset will find the highest-risk issues faster than continuing into another feature slice immediately.
- Action: Ran four focused reviewer passes across API/auth/link/share, Realm/sync/history/favorites, Queue/Cast/CarPlay, and tests/simplification. Accepted and fixed issues around secret/error hygiene, duplicate session metadata lookup, one-time catalog favorite import scoping, pending operation sync wakeups, playlist operation 409 retryability, Cast status reconciliation by Queue V2 item ID, runtime block-aware shuffle, and stale dead queue restore code. A post-fix reviewer pass then found same-scope in-flight sync rerun loss and duplicate Queue V2 runtime row loss; both were fixed with targeted tests before commit.
- Evidence: Focused review-cleanup tests passed with `yarn test -- api-config sanitizer share-token-exchange favorite-sync playlist-operation-outbox user-library-sync-runner playback-history-batch playback-history-recording auth-session-realm development-auth queue-v2 cast-queue-v2` covering 13 files / 106 tests before the final reviewer pass. Post-fix focused tests passed with `yarn test -- user-library-sync-runner queue-v2 cast-queue-v2` covering 4 files / 34 tests. Full `yarn test` passed with 19 files / 154 tests; `yarn ts:check`, `yarn lint`, and `git diff --check` passed. iOS Simulator bundle/render smoke passed on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D` with local API env vars. Both local API ports were listening during the final check, but live response smoke remains deferred because catalog `/api/v3/artists` returned 500 and simple user-library probe paths returned 404.
- Verdict: pass
- Next Action: continue
- Next move: Commit `MOB-REVIEW-001`, then claim `MOB-FAV-003` for source/show/library selection favorite consumers unless local API servers are available for live auth/sync/history/share-link smoke.

### Iteration 27

- Timestamp: 2026-06-20T18:02:25Z
- Hypothesis: Healthy local API servers can close the deferred live base-routing smoke, and any remaining failure will identify a mobile probe-contract mismatch rather than a broader networking issue.
- Action: Corrected `runLocalApiBaseUrlProbe` so the catalog probe still uses `/api/v3/artists?include_autocreated=false` while the user-library probe checks service `GET /health` directly. Ran direct local catalog/user health/auth checks, then launched the iOS Simulator app bundle with both local API base URLs through Metro.
- Evidence: `yarn test -- api-config`, `yarn test`, `yarn ts:check`, `yarn lint`, and `git diff --check` passed. Direct smokes returned 200 for `http://localhost:3823/api/v3/artists?include_autocreated=false`, `http://localhost:3823/api/v2/shows/today?month=6&day=20`, `http://localhost:5119/health`, `POST http://localhost:5119/api/v3/library/auth/development/session`, and authenticated `GET http://localhost:5119/api/v3/library/users/me`; unauthenticated `/users/me` returned the expected 401 with `Cache-Control: no-store`. Metro on simulator `DEC49863-5AF8-4832-8BA2-C5E7C41A029D` served successful catalog requests against `localhost:3823`; screenshot artifact `/tmp/relisten-local-api-live-smoke.png`.
- Verdict: pass
- Next Action: continue
- Next move: Commit `MOB-API-002`, then resume `MOB-FAV-003` for source/show/library selection favorite consumers.

### Iteration 28

- Timestamp: 2026-06-20T18:23:01Z
- Hypothesis: The cleanest way to move read-side favorite consumers off catalog booleans is to make `LibraryIndex` choose the effective favorite source once, then have screens and CarPlay consume direct favorite and library-membership predicates from that index.
- Action: Added active-scope-aware favorite sets to `LibraryIndex`, kept anonymous scopes on legacy catalog flags, split user-initiated download membership from general offline availability, updated artist/My Library/show/source/song/tour/CarPlay consumers to use the index, extracted a shared scoped favorite hook for both the reusable favorite button and source detail controls, and added focused index plus CarPlay source-selection tests.
- Evidence: `yarn test -- library-index` passed with 4 tests; `yarn test -- library-index favorite-sync source_selection` passed with 16 tests; full `yarn test` passed with 21 files / 160 tests; `yarn ts:check`, `yarn lint`, and `git diff --check` passed. Subagent reviewer `019ee642-a01c-7aa1-850b-2714a3b8c393` found the source detail control gap and missing CarPlay source-selection coverage; both were fixed. iOS Simulator bundle/render smoke passed on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D` with screenshot `/tmp/relisten-mob-fav-003-final-smoke.png`. After the API thread restarted local servers, live smoke passed for user-library `/health`, catalog `/api/v3/artists?include_autocreated=false`, Development session issue, bearer `/users/me`, favorite PUT/list/delete for artist `77a58ff9-2e01-c59c-b8eb-cff106049b72`, and logout.
- Verdict: pass
- Next Action: continue
- Next move: Commit `MOB-FAV-003`, then choose the next local API live-smoke slice while servers are reachable.

## Root Coordination Notes

- The active set intentionally starts with foundations: local API config, deterministic test harness, deep-link sanitizer, and Queue V2 playback foundation.
- The playlist UX workstream is backlog with `next_action: ask_user` because it needs another grill-me pass after auth and basic user-data paths exist.
- Before using Git worktrees, create or switch to a `codex/...` branch for the active workstream and record it in the root board and workstream ledger.
- After each foundational slice, run `yarn lint` and `yarn ts:check`; once the test harness exists, also run the relevant targeted JS/TS tests.
- Google OAuth client files were provided out of band for future auth work. Do not commit downloaded client files or local absolute secret paths as part of this scoped Realm branch.
