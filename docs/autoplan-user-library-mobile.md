# Build Relisten Mobile User Library Components

This AutoPlan is a living document. The sections `Progress`, `Workstream Board`, `Current Hypothesis`, `Next Iteration`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept current as work proceeds.

The repository does not currently contain `PLANS.md` or `AUTOPLANS.md`. This document follows the fallback AutoPlan rules from `/Users/alecgorge/.codex/skills/autoplan/references/AUTOPLANS.md` and the fallback ExecPlan quality bar from `/Users/alecgorge/.codex/skills/autoplan/references/PLANS.md`.

## Purpose / Big Picture

Relisten mobile needs to become a first-class client for user accounts, playlists, favorites sync, and playback history while preserving the existing offline-first catalog playback experience. Success means a user can run the app in the iOS Simulator against a local catalog API and local user-library API, sign into a development account using real access/refresh token behavior, play catalog queues without regression, and later play playlist queues whose identity survives duplicate tracks, block shuffle, restore, Cast, CarPlay, and history attribution.

Concrete headway is visible when local API configuration is switchable without source edits, sensitive deep-link tokens are scrubbed before generic routing/logging, Queue V2 behavior is covered by fast tests, scoped user data can be introduced without corrupting shared catalog Realm rows, and each later auth/sync/UX slice has an explicit workstream instead of being folded into one oversized mobile rewrite.

## Goal

Create and execute the mobile-side plan for the user-library M1 contract described in `/Users/alecgorge/code/relisten/RelistenApi/docs/design/2026-04-11-relisten-playlists-user-accounts-design.md`, with local development support for:

- a separate catalog API client using catalog caching behavior;
- a separate user-library API client using auth, refresh, no-store, and mutation-friendly behavior;
- catalog API base URL defaulting to production but overrideable to `http://localhost:3823/api`;
- user-library API base URL defaulting to production but overrideable to `http://localhost:5119`;
- iOS Simulator as the first runnable smoke target.

## Evaluation Mode

Deterministic. The primary evidence is passing `yarn lint`, `yarn ts:check`, targeted JavaScript/TypeScript tests once the harness exists, and an iOS Simulator smoke path against local `RelistenUserApi`.

Rubric judgment is allowed for the later playlist UX workstream only. That UX rubric must be written into `docs/workstreams/backlog/playlist-mobile-ux/plan.md` after auth and basic user-data paths work.

## Acceptance Evidence

The full mobile goal is accepted only when all of the following are true:

- `yarn lint` succeeds.
- `yarn ts:check` succeeds.
- A small deterministic JS/TS test command exists and covers at least API base selection, deep-link token sanitization, Queue V2 shuffle grouping, and user-library client auth retry decisions.
- The existing catalog client remains available for read-heavy catalog endpoints and retains its ETag/rate-limit caching behavior.
- A separate user-library client exists for `/api/v3/library` endpoints and does not share catalog GET caching, URL logging, or ETag behavior.
- Local iOS Simulator development can point catalog reads at `http://localhost:3823/api` and user-library calls at `http://localhost:5119` without editing source code.
- The app can obtain and refresh real local user-library tokens through a Development-only server path supplied by `RelistenUserApi`; mobile does not fake authenticated state locally as the primary development flow.
- Cold-start and warm-link handling scrub `auth_code`, `code`, `state`, `t`, and token-like query params before generic routing, logging, navigation state serialization, analytics, crash reporting, or error UI.
- Queue V2 supports catalog queue items and playlist queue items, migrates existing source-track queues to catalog items, block-shuffles by `blockUuid ?? playlistEntryUuid`, and preserves `playlistEntryUuid` for playback cursor/history attribution.
- Scoped Realm user-owned rows exist for the M1 user data families; catalog rows remain shared cache, and signed-in user data is not represented by long-term booleans on catalog rows.
- Auth/session services use secure storage for refresh tokens, inject Bearer access tokens for `/api/v3/library`, refresh on 401 within bounded retry rules, and sign out/revoke without deleting scoped local rows by default.
- Favorites migration preserves Artist, Show, Source, SourceTrack, Tour, and Song favorites for authenticated sync while signed-out behavior stays compatible during rollout.
- Playback history writes a scoped local journal with `clientEventUuid`, `deviceId`, optional `playlistUuid`, optional `playlistEntryUuid`, and batch-upload status.
- Cast and CarPlay can represent playlist queue identity, duplicate source tracks, block shuffle state, and playlist attribution before playlist playback is declared release-ready.

Fast day-to-day checks are narrower: run the targeted JS/TS tests for the workstream under development, then `yarn ts:check`. Run `yarn lint` before claiming a completed slice.

## Mutable Surface

In bounds:

- `relisten/api/` and nearby configuration files for splitting catalog and user-library API clients.
- `relisten/player/`, `relisten/realm/models/player_state.ts`, and playback state adapters for Queue V2.
- `relisten/realm/` and scoped user-data model files for user-owned rows.
- `relisten/playback_history_reporter.ts` and history model/repository files for scoped history journal and batch upload.
- `relisten/lastfm/` only as a pattern reference for secure storage and auth callback handling, not as a shared account system.
- `app/+not-found.tsx`, app layout/listener files, and new route/sanitizer modules for deep-link and auth callback routing.
- `relisten/casting/` and `relisten/carplay/` when queue identity reaches those paths.
- `app/relisten/tabs/(myLibrary)/` and related screens when the UX workstream is promoted.
- `package.json`, lockfile, and test config files only to add a minimal deterministic test harness.
- This AutoPlan package under `docs/autoplan-user-library-mobile.md`, `docs/loop-ledger-user-library-mobile.md`, and `docs/workstreams/...`.

Out of bounds unless this AutoPlan is explicitly updated:

- Server implementation in `/Users/alecgorge/code/relisten/RelistenApi`. Server needs are coordinated through the API thread and server AutoPlan.
- Realm to TanStack DB migration. M1 builds on Realm.
- Production Apple/Google provider setup inside mobile before the local dev auth path and user-library client are proven.
- Full playlist UX polish before auth, local API, Queue V2, and scoped data foundations are working.
- Broad rewrites of the native audio module unless Queue V2 evidence proves the JS/native interface cannot carry required identity.

## Iteration Unit

One iteration is a scoped mobile increment with a named mutable surface, a validator, and an observable result. Examples: "add separate API base config and prove user-library health call hits localhost", "add URL sanitizer with cold/warm link tests", or "add Queue V2 pure grouping function and tests." An iteration is not complete until the relevant workstream ledger records evidence, conclusion, and exactly one `next_action`.

## Loop Budget

Default root budget is eight root coordination iterations before reassessing active workstream count. If two consecutive iterations in one workstream do not produce passing targeted checks or a precise blocker, pivot by shrinking that workstream or creating a subordinate ExecPlan.

## Dispositions

Allowed `next_action` values are `continue`, `retry`, `pivot`, `undo`, `ask_user`, and `done`.

## Pivot Rules

Pivot when:

- the user-library client starts inheriting catalog ETag/rate-limit caching or full-URL logging;
- local auth cannot obtain real access/refresh tokens from `RelistenUserApi` in Development;
- Queue V2 requires native audio changes before pure TypeScript behavior is tested;
- Realm migrations risk deleting existing catalog data or signed-out library data;
- deep-link secrets can still reach `+not-found`, logs, Sentry, analytics, or navigation state;
- Cast or CarPlay cannot round-trip playlist item identity after Queue V2 reaches those surfaces;
- playlist UX questions block data/model foundations.

The preferred pivot is to narrow the slice and improve the fastest validator before adding abstractions.

## Stop Conditions

Stop as `done` when acceptance evidence is complete and all workstream ledgers show `next_action: done`.

Stop as `ask_user` when a product decision is required, especially for playlist UX labels, signed-out share-token UX, account deletion/export presentation, old-history upload opt-in, or source/tour/song favorite deprecation.

Stop as `undo` only when a change leaks secrets, corrupts persisted player/Realm state, breaks existing catalog playback, or creates irreversible data loss risk.

## Milestones

Milestone 1 establishes the mobile development foundation. It adds separate base URL configuration, keeps catalog and user-library clients separate, adds a minimal deterministic JS/TS test harness, documents local iOS Simulator smoke commands, and proves the app can target local `RelistenUserApi` without editing source.

Milestone 2 hardens link and auth foundations. It adds first-class sanitization for playlist share links and auth callbacks, introduces secure user-library token storage, and exercises Development-only local sign-in against `RelistenUserApi`.

Milestone 3 implements Queue V2 without shipping playlist UX. It introduces catalog and playlist queue item identity, migrates persisted source-track queues into catalog Queue V2 items, tests block shuffle, and preserves existing catalog/source playback.

Milestone 4 introduces scoped Realm user data and sync foundations. It adds active scope, scoped user-owned models, user-library repositories, outbox shape, and enough sync plumbing to pull/apply basic user data without moving catalog cache identity.

Milestone 5 migrates favorites and history behavior. It preserves signed-out favorites/history, migrates current favorite flags into scoped authenticated favorites on first sync, and writes new authenticated history to a scoped batch-upload journal.

Milestone 6 extends playlist identity outside React screens. It wires Queue V2 identity through Cast and CarPlay, proves duplicate source-track entries remain distinguishable, and keeps catalog queue behavior working.

Milestone 7 designs and implements playlist UX. It refines `playlist-mobile-ux` after auth and basic user-data flows exist, then implements My Library playlist sections, signed-out share states, add-to-playlist flows, block creation/reorder, invite states, unavailable entries, partial-offline blocks, and conflict result states.

## Progress

- [x] 2026-06-19T23:43:40Z Created this root AutoPlan package after user confirmed separate base URLs/clients, dev-only local auth, foundation-first active workstreams, deterministic JS/TS tests, and iOS Simulator as the first smoke target.
- [x] 2026-06-19T23:43:40Z Sent API-thread steering to Codex thread `019ee12c-f057-7601-8e0b-9d77e22670a4` requesting a Development-only local auth path in `RelistenUserApi`.
- [x] 2026-06-20T00:18:16Z Promoted `scoped-realm-user-data` after direct user steering, claimed branch `codex/scoped-realm-user-data`, and made this branch responsible for the minimal test harness needed by the scope validators.
- [x] 2026-06-20T00:44:27Z Claimed `local-api-dev-config` experiment `MOB-API-001` and `test-harness-foundation` continuation `MOB-TEST-001`.
- [x] 2026-06-20T00:54:51Z Completed `local-api-dev-config` experiment `MOB-API-001`: separate catalog/user-library base URL config, user-library client skeleton, non-UI local API probe, docs, tests, and simulator bundle smoke with local env vars.
- [x] 2026-06-20T00:54:51Z Completed `test-harness-foundation` continuation `MOB-TEST-001`: targeted API config tests using the existing Vitest harness.
- [x] 2026-06-20T00:56:32Z Claimed `deep-link-sanitizer` experiment `MOB-LINK-001`.
- [x] 2026-06-20T01:07:02Z Completed `deep-link-sanitizer` experiment `MOB-LINK-001`: pure sanitizer, scrubbed fallback logs/navigation, first-class playlist/auth placeholder routes, focused tests, subagent review, and iOS Simulator deep-link smoke.
- [x] 2026-06-20T01:09:59Z Claimed `queue-v2-playback-foundation` experiment `MOB-QUEUE-001`.
- [x] 2026-06-20T01:17:21Z Completed `queue-v2-playback-foundation` experiment `MOB-QUEUE-001`: pure Queue V2 identity, catalog migration helpers, duplicate playlist entry keying, history/cursor attribution, block shuffle grouping, tests, and subagent review.
- [x] 2026-06-20T01:20:18Z Claimed `queue-v2-playback-foundation` experiment `MOB-QUEUE-002`.
- [x] 2026-06-20T01:32:26Z Completed `queue-v2-playback-foundation` experiment `MOB-QUEUE-002`: additive Queue V2 PlayerState fields, catalog queue save/restore integration, restore-plan tests, simulator playback/restore smoke, and subagent review.
- [x] 2026-06-20T01:36:45Z Claimed `queue-v2-playback-foundation` experiment `MOB-QUEUE-003`.
- [x] 2026-06-20T01:54:34Z Completed `queue-v2-playback-foundation` experiment `MOB-QUEUE-003`: Queue V2 metadata on runtime queue tracks, batched catalog queue construction, duplicate-safe persistence normalization, cloned queue inserts, legacy fallback coverage, simulator playback smoke, and subagent review.
- [x] 2026-06-20T00:34:01Z Completed `scoped-realm-user-data` experiment `MOB-SCOPE-001`: additive scoped Realm rows, active scope service, deterministic scope tests, and iOS Simulator smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`.
- [ ] Promote auth/session after local API config and Development-only auth basics are in place.
- [ ] Revisit playlist UX workstream only after auth and basic user-data foundations are working.

## Workstream Board

| Workstream | Status | Responsible agent | Blocker | Plan | Ledger | Worktree | Next step | Latest next_action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| local-api-dev-config | done | root Codex agent | live server response smoke waits on local catalog/user API processes; ports 3823/5119 were not listening during this slice | `docs/workstreams/active/local-api-dev-config/plan.md` | `docs/workstreams/active/local-api-dev-config/ledger.md` | branch `codex/scoped-realm-user-data` | Use the documented env vars and `runLocalApiBaseUrlProbe` when local servers are running. | `done` |
| test-harness-foundation | done | root Codex agent | none | `docs/workstreams/active/test-harness-foundation/plan.md` | `docs/workstreams/active/test-harness-foundation/ledger.md` | branch `codex/scoped-realm-user-data` | Reuse Vitest for sanitizer, Queue V2, auth retry, and sync reducer tests. | `done` |
| deep-link-sanitizer | done | root Codex agent | none | `docs/workstreams/active/deep-link-sanitizer/plan.md` | `docs/workstreams/active/deep-link-sanitizer/ledger.md` | branch `codex/scoped-realm-user-data` | Reuse sanitizer in share-token exchange and auth callback implementation. | `done` |
| queue-v2-playback-foundation | active | root Codex agent | playlist queue construction not started yet | `docs/workstreams/active/queue-v2-playback-foundation/plan.md` | `docs/workstreams/active/queue-v2-playback-foundation/ledger.md` | branch `codex/scoped-realm-user-data` | Add playlist queue construction with playlist entry identity and block metadata. | `continue` |
| auth-session-user-service-client | backlog | unassigned | local API config plus Development-only server auth path | `docs/workstreams/backlog/auth-session-user-service-client/plan.md` | `docs/workstreams/backlog/auth-session-user-service-client/ledger.md` | none | Implement secure token storage, refresh-on-401, sign-out/revoke, and account release gates. | `continue` |
| scoped-realm-user-data | done | root Codex agent | full auth wiring deferred to `auth-session-user-service-client` | `docs/workstreams/active/scoped-realm-user-data/plan.md` | `docs/workstreams/active/scoped-realm-user-data/ledger.md` | branch `codex/scoped-realm-user-data` | Commit completed scoped Realm foundation. | `done` |
| mobile-share-token-exchange | backlog | unassigned | deep-link sanitizer and user-library client | `docs/workstreams/backlog/mobile-share-token-exchange/plan.md` | `docs/workstreams/backlog/mobile-share-token-exchange/ledger.md` | none | Exchange playlist share tokens for signed-out grants or signed-in relationships. | `continue` |
| playlist-sync-outbox | backlog | unassigned | scoped Realm user data and playlist endpoints | `docs/workstreams/backlog/playlist-sync-outbox/plan.md` | `docs/workstreams/backlog/playlist-sync-outbox/ledger.md` | none | Implement user-data pull sync and pending operation replay. | `continue` |
| favorites-sync-migration | backlog | unassigned | scoped Realm user data and favorites endpoints | `docs/workstreams/backlog/favorites-sync-migration/plan.md` | `docs/workstreams/backlog/favorites-sync-migration/ledger.md` | none | Preserve and migrate Artist/Show/Source/SourceTrack/Tour/Song favorites. | `continue` |
| history-batch-upload-migration | backlog | unassigned | auth/session and scoped history model | `docs/workstreams/backlog/history-batch-upload-migration/plan.md` | `docs/workstreams/backlog/history-batch-upload-migration/ledger.md` | none | Move new authenticated history to scoped journal and batch upload. | `continue` |
| carplay-cast-playlist-identity | backlog | unassigned | Queue V2 playback foundation | `docs/workstreams/backlog/carplay-cast-playlist-identity/plan.md` | `docs/workstreams/backlog/carplay-cast-playlist-identity/ledger.md` | none | Carry playlist item identity through Cast and CarPlay. | `continue` |
| playlist-mobile-ux | backlog | unassigned | auth and basic user-data paths; needs clarification before implementation | `docs/workstreams/backlog/playlist-mobile-ux/plan.md` | `docs/workstreams/backlog/playlist-mobile-ux/ledger.md` | none | Re-run grill-me on UX flows once foundations work. | `ask_user` |

## Current Hypothesis

Queue V2 catalog playback can now carry item metadata without changing playback behavior. The next Queue V2 risk is playlist queue construction: playlist entries need to preserve `playlistEntryUuid`, optional block metadata, duplicate source-track identity, and the same save/restore/current-item behavior before Cast or CarPlay playlist identity work is useful.

## Next Iteration

Commit `MOB-QUEUE-003`, then either continue Queue V2 with playlist queue construction or promote `auth-session-user-service-client` if the Development-only local auth endpoint is ready from `RelistenUserApi`.

## Workstream Notes

New steering requests must be classified before changing this board. Ready workstreams should not be left without a responsible agent unless this file and `docs/loop-ledger-user-library-mobile.md` record why.

Use worktrees for parallel implementation once branches are claimed and write surfaces are disjoint. The likely first split is local API config/test harness versus Queue V2 pure logic.

The playlist UX workstream is intentionally light for now. The user confirmed UX probably needs significant clarification and should be filled out after auth and basic data paths work.

## Surprises & Discoveries

- Observation: The existing catalog API client hardcodes `https://api.relisten.net/api` and has a commented local override.
  Evidence: `relisten/api/client.ts` defines `RelistenApiClient.API_BASE` and includes a commented local `http://192.168.6.100:3823/api` value.
- Observation: The existing generic not-found route logs route params and redirects unknown web paths, which is unsafe for share tokens or auth callbacks.
  Evidence: `app/+not-found.tsx` logs `JSON.stringify(globalSearchParams)`.
- Observation: Current persisted player state is source-track based.
  Evidence: `relisten/realm/models/player_state.ts` stores `queueSourceTrackUuids`, shuffled source-track UUID arrays, and active source-track indexes.
- Observation: The current local playback reporter uploads anonymous plays one at a time to `/api/v2/live/play`.
  Evidence: `relisten/playback_history_reporter.ts` calls `RelistenApiClient.recordPlayback`, which posts to `/v2/live/play`.
- Observation: Vitest cannot import the full app Realm config in Node without pulling React Native Flow source through unrelated app imports.
  Evidence: `scoped_user_library_models.test.ts` opens a temp Realm with `USER_LIBRARY_REALM_MODELS` directly, while the iOS Simulator smoke verifies the full app bundle loads.
- Observation: Expo requires static dot-notation references for `EXPO_PUBLIC_*` values to be inlined into the app bundle.
  Evidence: Subagent review caught the issue; `relisten/api/config.ts` now builds its default env snapshot with `process.env.EXPO_PUBLIC_RELISTEN_CATALOG_API_BASE_URL` and `process.env.EXPO_PUBLIC_RELISTEN_USER_API_BASE_URL`.
- Observation: No local API servers were listening on ports `3823` or `5119` during `MOB-API-001`.
  Evidence: `lsof -nP -iTCP:5119 -sTCP:LISTEN` and `lsof -nP -iTCP:3823 -sTCP:LISTEN` produced no listeners, so live local request evidence is deferred.

## Decision Log

- Decision: Use separate catalog and user-library API clients with separate base URLs.
  Rationale: Catalog reads are cache-heavy and currently use ETag/rate-limit behavior. User-library endpoints are auth-sensitive, mutation-heavy, and should default to no-store semantics and different logging behavior.
  Date/Author: 2026-06-19 / User and Codex.
- Decision: Target a Development-only server auth path for local mobile sign-in.
  Rationale: Mobile should exercise real access/refresh tokens against local `RelistenUserApi` without waiting for production Apple/Google credentials, while avoiding fake local authenticated state as the primary dev path.
  Date/Author: 2026-06-19 / User and Codex.
- Decision: Make iOS Simulator the first local smoke target.
  Rationale: `localhost:5119` maps cleanly for the iOS Simulator. Android emulator and physical-device host overrides can come later through the same base URL config.
  Date/Author: 2026-06-19 / User and Codex.
- Decision: Add a minimal deterministic JS/TS test harness early.
  Rationale: Queue V2, URL sanitization, API base selection, and sync reducers need fast tests. `yarn lint` and `yarn ts:check` alone are not enough for the risky pure logic.
  Date/Author: 2026-06-19 / User and Codex.
- Decision: Keep playlist UX in backlog until auth and basic user-data foundations work.
  Rationale: The UX has unresolved product and flow questions. Refining it too early would mix speculative screen design with foundational persistence/auth/playback changes.
  Date/Author: 2026-06-19 / User and Codex.
- Decision: Leave repo `AGENTS.md` unchanged for now.
  Rationale: The user asked for a mobile AutoPlan package. A permanent repo operating-model note can be added later if this AutoPlan becomes the ongoing implementation driver.
  Date/Author: 2026-06-19 / Codex.
- Decision: Execute the scoped Realm foundation before full auth basics are implemented.
  Rationale: The user explicitly asked to execute this workstream now. The safe slice is additive Realm models, active scope identity, and signal tests; production auth/token behavior remains in the auth/session workstream.
  Date/Author: 2026-06-20 / User and Codex.
- Decision: Treat Google OAuth client files as local auth inputs, not repo artifacts.
  Rationale: The user supplied local downloaded client config paths during this scoped Realm branch. The files and absolute secret paths should not be committed; the auth workstream should consume the needed values through a deliberate local configuration path.
  Date/Author: 2026-06-20 / User and Codex.

## Outcomes & Retrospective

2026-06-19: Initial mobile AutoPlan package created. No implementation work has started in this repo as part of this AutoPlan yet. The API thread has been notified that mobile needs a Development-only auth path for local token-based sign-in.

2026-06-20: `MOB-SCOPE-001` completed on branch `codex/scoped-realm-user-data`. The branch adds the test harness, scoped Realm user-library models, active scope helpers, schema version 13, and focused tests. Validation passed with `yarn test -- scope`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, and an iOS Simulator launch on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`.

2026-06-20: `MOB-API-001` and `MOB-TEST-001` continuation completed on branch `codex/scoped-realm-user-data`. The branch adds explicit catalog/user-library API config, a separate no-store user-library client, a non-UI local API probe helper, local dev docs, and API config tests. Validation passed with `yarn test -- api-config`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, and an iOS Simulator bundle launch with local API env vars set.

2026-06-20: `MOB-LINK-001` completed on branch `codex/scoped-realm-user-data`. The branch adds a pure deep-link sanitizer, removes raw query-param logging/navigation forwarding from `+not-found`, and owns placeholder playlist/auth callback routes before future token exchange work. Validation passed with `yarn test -- sanitizer`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, two-pass subagent review, and iOS Simulator deep-link smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`.

2026-06-20: `MOB-QUEUE-001` completed on branch `codex/scoped-realm-user-data`. The branch adds pure Queue V2 item identity, catalog migration helpers, duplicate playlist-entry keying, playback cursor/history attribution, and block shuffle grouping tests. Validation passed with `yarn test -- queue-v2`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, and two-pass subagent review. Simulator smoke was skipped because no runtime playback code changed.

2026-06-20: `MOB-QUEUE-002` completed on branch `codex/scoped-realm-user-data`. The branch adds additive Queue V2 fields to `PlayerState`, writes catalog Queue V2 state alongside legacy queue fields, and restores catalog queues by Queue V2 current key when available. Validation passed with `yarn test -- queue-v2 player_state`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, iOS Simulator playback/restore smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`, and follow-up subagent review.

2026-06-20: `MOB-QUEUE-003` completed on branch `codex/scoped-realm-user-data`. The branch carries Queue V2 item metadata on runtime queue tracks, assigns batched catalog items for source-screen and CarPlay queue construction, normalizes catalog item ids at persistence time, clones inserted queue rows to avoid runtime aliasing, and preserves stale legacy restore fallback behavior. Validation passed with `yarn test -- queue-v2 player_state`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, iOS Simulator source-page playback smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`, and three reviewer passes that drove duplicate-id and fallback fixes.
