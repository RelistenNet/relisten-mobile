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
- [x] 2026-06-20T01:57:39Z Claimed `queue-v2-playback-foundation` experiment `MOB-QUEUE-004`.
- [x] 2026-06-20T02:07:18Z Completed `queue-v2-playback-foundation` experiment `MOB-QUEUE-004`: fractional string playlist entry positions, schema version 15 migration, pure playlist Queue V2 construction, playable hydrated item filtering, simulator playback smoke, and subagent review.
- [x] 2026-06-20T02:08:41Z Claimed `carplay-cast-playlist-identity` experiment `MOB-CAST-001`.
- [x] 2026-06-20T04:10:27Z Completed `carplay-cast-playlist-identity` experiment `MOB-CAST-001`: Queue V2 Cast queue-item custom data, duplicate playlist entry payload tests, full test/lint/type gates, and subagent review; live Cast hardware validation remains deferred.
- [x] 2026-06-20T04:12:24Z Claimed `auth-session-user-service-client` experiment `MOB-AUTH-001` after verifying the server dev-auth endpoint exists locally.
- [x] 2026-06-20T04:24:17Z Completed `auth-session-user-service-client` experiment `MOB-AUTH-001`: SecureStore refresh-token storage, Development-only session sign-in, refresh/logout calls, in-memory access token handling, bounded protected-request 401 retry, focused edge-case tests, and subagent review. Live local API auth smoke remains deferred because port `5119` was not listening.
- [x] 2026-06-20T04:24:23Z Claimed `auth-session-user-service-client` experiment `MOB-AUTH-002` for non-secret session metadata and active-scope bridging.
- [x] 2026-06-20T04:29:39Z Completed `auth-session-user-service-client` experiment `MOB-AUTH-002`: auth token responses now persist non-secret session metadata, validate server `scope_id`, switch active authenticated scope, preserve scoped rows on sign-out, reject stale refreshes after sign-out, and have focused Realm tests plus subagent review.
- [x] 2026-06-20T04:31:11Z Claimed `playlist-sync-outbox` experiment `MOB-SYNC-001` for scoped pull-sync playlist application and cursor persistence.
- [x] 2026-06-20T04:38:55Z Completed `playlist-sync-outbox` experiment `MOB-SYNC-001`: typed sync DTOs, scoped playlist snapshot application, entry replacement, playlist/access tombstones, guarded cursor persistence, schema version 16, focused tests, and subagent review.
- [x] 2026-06-20T04:40:24Z Claimed `favorites-sync-migration` experiment `MOB-FAV-001` for scoped favorite sync and one-time local flag migration.
- [x] 2026-06-20T04:50:49Z Completed `favorites-sync-migration` experiment `MOB-FAV-001`: server-aligned favorite entity types, authenticated favorite API helpers, scoped favorite changes/tombstones, one-time local catalog favorite migration on first supported pull sync, rollback tests, and subagent review.
- [x] 2026-06-20T04:53:38Z Claimed `playlist-sync-outbox` experiment `MOB-SYNC-002` for idempotent playlist operation persistence and replay.
- [x] 2026-06-20T05:08:55Z Completed `playlist-sync-outbox` experiment `MOB-SYNC-002`: typed playlist operation outbox, GUID validation, idempotent pending operation persistence, replay status transitions, canonical playlist reconciliation, retryable auth/network failures, terminal deterministic errors, concurrency guard, focused tests, and subagent review.
- [x] 2026-06-20T05:11:09Z Claimed `playlist-sync-outbox` experiment `MOB-SYNC-003` for authenticated sync lifecycle wiring.
- [x] 2026-06-20T05:23:29Z Completed `playlist-sync-outbox` experiment `MOB-SYNC-003`: root lifecycle bootstrap, separate user-library sync/auth clients, authenticated replay-before-pull runner, server-scope token validation, refresh-on-401 retry, stale-scope guards, queued scope-change reruns, focused tests, and subagent review.
- [x] 2026-06-20T05:37:41Z Claimed `history-batch-upload-migration` experiment `MOB-HIST-001` for scoped history journal and batch client helpers.
- [x] 2026-06-20T05:44:30Z Completed `history-batch-upload-migration` experiment `MOB-HIST-001`: scoped playback-history journal, batch upload DTO/client helper, Queue V2 block attribution, schema version 17, focused tests, and subagent review.
- [x] 2026-06-20T05:46:48Z Claimed `history-batch-upload-migration` experiment `MOB-HIST-002` for playback reporter journaling and authenticated batch upload.
- [x] 2026-06-20T05:58:44Z Completed `history-batch-upload-migration` experiment `MOB-HIST-002`: existing reporter writes authenticated scoped journal rows when a signed-in session exists, sync runner flushes `/history/batch` with refresh-on-401 behavior, pending-history rows trigger lifecycle sync, multi-batch backlog draining is tested, and signed-out anonymous reporting remains untouched.
- [x] 2026-06-20T06:00:38Z Claimed `carplay-cast-playlist-identity` experiment `MOB-CAST-002` for CarPlay Queue V2 row identity.
- [x] 2026-06-20T06:05:59Z Completed `carplay-cast-playlist-identity` experiment `MOB-CAST-002`: CarPlay queue rows now use Queue V2-backed IDs with runtime fallback selection, duplicate playlist entries and cloned runtime rows are covered by focused tests, and live CarPlay UI validation remains deferred.
- [x] 2026-06-20T06:07:13Z Claimed `auth-session-user-service-client` experiment `MOB-AUTH-003` for a Development-only sign-in surface.
- [x] 2026-06-20T06:15:40Z Completed `auth-session-user-service-client` experiment `MOB-AUTH-003`: Settings now has a `__DEV__`-only local sign-in/sign-out panel backed by the real auth service, session metadata bridge, active scope switch, failure-path cleanup tests, and no committed Google/OAuth client files.
- [x] 2026-06-20T06:31:53Z Completed `mobile-share-token-exchange` experiment `MOB-SHARE-001`: `/playlist/{shortId}?t=...` route exchange handling, typed user-library exchange helper, SecureStore grant-secret boundary, scoped Realm grant metadata, tokenless read header construction, SecureStore key and scope-race regressions, and subagent review/re-review.
- [x] 2026-06-20T06:34:56Z Completed `playlist-mobile-ux` clarification experiment `MOB-UX-CLAR-001`: concrete UX rubric, screen map, implementation slices, validators, and open grill-me prompts for playlist library/detail/add/share/collaboration/conflict decisions.
- [x] 2026-06-20T17:25:09Z Completed `favorites-sync-migration` experiment `MOB-FAV-002`: signed-in reusable favorite buttons now read scoped rows and write authenticated favorite mutations with rollback, while signed-out catalog flag behavior remains intact; subagent review was unavailable due the Codex usage limit, so root performed a local correctness pass and added missing-session rollback coverage.
- [x] 2026-06-20T17:52:24Z Completed root review cleanup `MOB-REVIEW-001`: four fresh reviewer passes plus a post-fix validation pass after the usage-limit reset found and drove fixes for user-library API error-body exposure, URL fragment scrubbing, share-token SecureStore key encoding, global catalog-favorite import scoping, pending-operation bootstrap triggers and in-flight reruns, playlist operation 409 retryability, Cast Queue V2 status reconciliation including duplicate local rows, actual block-aware runtime shuffle, duplicate session metadata helpers, duplicate Queue V2 runtime shuffle rows, React Compiler memoization in the scoped favorite button, and stale dead queue restore code.
- [x] 2026-06-20T18:02:25Z Completed `local-api-dev-config` live smoke correction `MOB-API-002`: `runLocalApiBaseUrlProbe` now checks user-library `/health`, direct catalog/user auth endpoints returned healthy responses, and an iOS Simulator Metro smoke proved the app bundle used both local API base URLs.
- [x] 2026-06-20T18:23:01Z Completed `favorites-sync-migration` experiment `MOB-FAV-003`: library membership, artist/show/source/song/tour favorite badges/filters, source detail controls, source selection priority, and CarPlay library source resolution now use active scoped favorite rows for signed-in users while anonymous users keep legacy catalog flags and user-initiated download behavior.
- [x] 2026-06-20T18:47:01Z Completed live local API smokes for favorites, history batch upload, pull sync, playlist operation replay payloads, and mobile share-token exchange while the API servers were reachable on ports `3823` and `5119`.
- [x] 2026-06-20T18:54:00Z Completed `playlist-mobile-ux` prerequisite `MOB-UX-001A`: non-UI playlist read service, mobile-grant header selection, shared snapshot application, and missing source-track hydration planning with focused tests.
- [x] 2026-06-20T00:34:01Z Completed `scoped-realm-user-data` experiment `MOB-SCOPE-001`: additive scoped Realm rows, active scope service, deterministic scope tests, and iOS Simulator smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`.
- [x] Promote auth/session after local API config and Development-only auth basics are in place.
- [x] Revisit playlist UX workstream only after auth and basic user-data foundations are working.

## Workstream Board

| Workstream | Status | Responsible agent | Blocker | Plan | Ledger | Worktree | Next step | Latest next_action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| local-api-dev-config | done | root Codex agent | none; live local catalog and user-library health smoke passed after the probe moved to `/health` | `docs/workstreams/active/local-api-dev-config/plan.md` | `docs/workstreams/active/local-api-dev-config/ledger.md` | branch `codex/scoped-realm-user-data` | Use the documented env vars and `/health` user-library probe for future local iOS Simulator smokes. | `done` |
| test-harness-foundation | done | root Codex agent | none | `docs/workstreams/active/test-harness-foundation/plan.md` | `docs/workstreams/active/test-harness-foundation/ledger.md` | branch `codex/scoped-realm-user-data` | Reuse Vitest for sanitizer, Queue V2, auth retry, and sync reducer tests. | `done` |
| deep-link-sanitizer | done | root Codex agent | none | `docs/workstreams/active/deep-link-sanitizer/plan.md` | `docs/workstreams/active/deep-link-sanitizer/ledger.md` | branch `codex/scoped-realm-user-data` | Reuse sanitizer in share-token exchange and auth callback implementation. | `done` |
| queue-v2-playback-foundation | active | root Codex agent | remaining playlist identity surfaces depend on playlist UX and history/sync slices | `docs/workstreams/active/queue-v2-playback-foundation/plan.md` | `docs/workstreams/active/queue-v2-playback-foundation/ledger.md` | branch `codex/scoped-realm-user-data` | Runtime shuffle now uses Queue V2 block units; reuse the same helpers when playlist playback UI is introduced. | `continue` |
| auth-session-user-service-client | active | root Codex agent | none for the Development-only auth path; production provider UI remains out of scope | `docs/workstreams/backlog/auth-session-user-service-client/plan.md` | `docs/workstreams/backlog/auth-session-user-service-client/ledger.md` | branch `codex/scoped-realm-user-data` | Use the dev Settings panel for manual auth UX smoke as needed; continue sync/history/share-link live endpoint validation in their own slices. | `continue` |
| scoped-realm-user-data | done | root Codex agent | full auth wiring deferred to `auth-session-user-service-client` | `docs/workstreams/active/scoped-realm-user-data/plan.md` | `docs/workstreams/active/scoped-realm-user-data/ledger.md` | branch `codex/scoped-realm-user-data` | Commit completed scoped Realm foundation. | `done` |
| mobile-share-token-exchange | done | root Codex agent | none; Follow/Clone/editor UX deferred to playlist UX workstream | `docs/workstreams/backlog/mobile-share-token-exchange/plan.md` | `docs/workstreams/backlog/mobile-share-token-exchange/ledger.md` | branch `codex/scoped-realm-user-data` | Reuse grant header helper in tokenless playlist reads once the read UI/client exists. | `done` |
| playlist-sync-outbox | active | root Codex agent | post-local-write flush waits on playlist mutation adapters/UX | `docs/workstreams/backlog/playlist-sync-outbox/plan.md` | `docs/workstreams/backlog/playlist-sync-outbox/ledger.md` | branch `codex/scoped-realm-user-data` | Pending operations now wake the lifecycle runner and 409 conflicts stay retryable; sync and operation endpoint payloads are live-smoked. | `continue` |
| favorites-sync-migration | done | root Codex agent | none; venue favorites remain legacy-only because venues are outside the M1 server favorite contract | `docs/workstreams/backlog/favorites-sync-migration/plan.md` | `docs/workstreams/backlog/favorites-sync-migration/ledger.md` | branch `codex/scoped-realm-user-data` | Reuse `LibraryIndex` and `useCatalogFavoriteState` for any future favorite consumers; server favorite endpoints are live-smoked locally. | `done` |
| history-batch-upload-migration | done | root Codex agent | old local history bulk-upload remains a deferred product decision outside this foundation | `docs/workstreams/backlog/history-batch-upload-migration/plan.md` | `docs/workstreams/backlog/history-batch-upload-migration/ledger.md` | branch `codex/scoped-realm-user-data` | Treat authenticated new-play history foundation as complete; defer old-history upload opt-in. | `done` |
| carplay-cast-playlist-identity | active | root Codex agent | live Cast/CarPlay hardware validation deferred unless available | `docs/workstreams/backlog/carplay-cast-playlist-identity/plan.md` | `docs/workstreams/backlog/carplay-cast-playlist-identity/ledger.md` | branch `codex/scoped-realm-user-data` | Cast status now reconciles through Queue V2 item IDs and CarPlay Queue V2 row identity is complete; revisit only when playlist UI creates deeper CarPlay browse flows. | `continue` |
| playlist-mobile-ux | active | root Codex agent | product answers needed for block label, create flow, add-range interaction, signed-out/editor-token prompts, follow/clone hierarchy, invites, conflicts, partial-offline copy, and share-link management | `docs/workstreams/backlog/playlist-mobile-ux/plan.md` | `docs/workstreams/backlog/playlist-mobile-ux/ledger.md` | branch `codex/scoped-realm-user-data` | Non-UI read/grant/hydration service is ready; ask the open UX questions in `MOB-UX-CLAR-001`, then implement `MOB-UX-001`. | `ask_user` |

## Current Hypothesis

Queue V2, scoped Realm rows, token/session handling, active authenticated scope switching, Development-only sign-in UI, playlist pull-sync application, scoped favorite migration, signed-in reusable favorite/source/show mutation controls, read-side scoped favorite consumers, playlist operation replay, authenticated lifecycle sync, signed-in playback history journaling/batch upload, Cast custom data/status reconciliation, CarPlay queue row identity, mobile share-token exchange/storage, branch-wide secret/error hygiene, and live local base-URL routing now have enough behavior in place for local user-data workflows. The live local smoke confirmed catalog reads, user API health, Development session issue, authenticated `/users/me`, favorite PUT/list/delete, history batch upload, pull sync, playlist operation payloads, share-token exchange, tokenless mobile-grant reads, and an iOS Simulator Metro bundle using both local base URLs. Playlist UX has a concrete implementation map, but polished UI implementation needs product answers before mutation/edit/share/collaboration surfaces are built.

## Next Iteration

Commit `MOB-UX-001A`, then resolve the playlist UX open questions before implementing `MOB-UX-001` read-only playlist/library surfaces. If product choices remain deferred, keep remaining work to conservative service seams rather than user-facing copy or flows.

## Workstream Notes

New steering requests must be classified before changing this board. Ready workstreams should not be left without a responsible agent unless this file and `docs/loop-ledger-user-library-mobile.md` record why.

Use worktrees for parallel implementation once branches are claimed and write surfaces are disjoint. The likely first split is local API config/test harness versus Queue V2 pure logic.

The playlist UX workstream now has a concrete execution map. Do not implement mutation/edit/share/collaboration UI until the open questions in `MOB-UX-CLAR-001` are answered or explicitly deferred.

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
- Observation: No local user-library API server was listening on port `5119` during `MOB-AUTH-001`.
  Evidence: `lsof -nP -iTCP:5119 -sTCP:LISTEN` produced no listener, so live Development auth token smoke remains deferred.
- Observation: Subagent review was not available during `MOB-FAV-002`.
  Evidence: The reviewer subagent failed before producing findings because the Codex account usage limit was reached. The root agent performed a local correctness pass and added auth-missing rollback coverage before committing the slice.
- Observation: React Native's installed `buffer@5.7.1` supports standard base64 but not the newer `base64url` encoding name.
  Evidence: `mobileAccessGrantSecretStorageKey()` now uses `Buffer.from(value, 'utf8').toString('base64')` plus URL-safe normalization, with a non-ASCII stable key vector test.
- Observation: The first user-library client error path exposed server response bodies, which can include sensitive diagnostics.
  Evidence: `RelistenUserLibraryApiClient` now throws generic `UserLibraryApiError` messages by status, and sync/outbox/history callers persist/display `safeUserLibraryErrorMessage()`.
- Observation: One-time catalog favorite migration must be global for the local catalog database, not per signed-in scope.
  Evidence: The migration marker uses a local catalog scope id and records only `importedToScopeId` in marker details, so a second signed-in user does not inherit the first import.
- Observation: Cast status reconciliation needs Queue V2 item IDs, because runtime identifiers can be stale after app restart or queue rebuild.
  Evidence: `castStatusRuntimeIdentifierForLocalQueue()` resolves top-level queue-item `queueV2ItemId` against local tracks before falling back to legacy media-info runtime identifiers.
- Observation: Queue V2 block shuffle was tested as a pure helper but not used by the runtime reshuffle path until the review cleanup.
  Evidence: `reshuffleTracks()` now shuffles Queue V2 track units and preserves the currently playing block unit at the front when reshuffling during playback.
- Observation: Same-scope `manual` and `history` sync triggers must queue a follow-up run when a sync is already in flight.
  Evidence: `UserLibrarySyncRunner` now queues those reasons and has a regression test where a playlist operation created after the first replay snapshot is flushed by the queued run.
- Observation: Runtime queue rows can share a Queue V2 item id after queue insertion clones, so helpers that convert Queue V2 items back to runtime tracks must be occurrence-aware.
  Evidence: `queueV2TrackShuffleUnits()` now shifts per-item track queues instead of using a one-value map, and Cast status reconciliation prefers an exact local runtime identifier before falling back to Queue V2 item id lookup.
- Observation: Local API processes were listening during the final review-cleanup smoke, but the endpoints were not healthy enough for an end-to-end user-data smoke.
  Evidence: `lsof` showed listeners on `3823` and `5119`; `curl 'http://localhost:3823/api/v3/artists?include_autocreated=false'` returned a 500 with `prepared statement did not exist`, and `curl http://localhost:5119/api/v3/library/users/check-username/relisten_probe` returned 404.
- Observation: The user-library local probe should target the service health endpoint, not a library-prefixed username-check route.
  Evidence: With the local API servers running, `GET http://localhost:5119/health` returned 200, while the old `/api/v3/library/users/check-username/relisten_probe` path is not part of the running user API contract. `runLocalApiBaseUrlProbe` now checks `/health` directly with a plain fetch.
- Observation: Live local base routing is now proven for the iOS Simulator path.
  Evidence: Direct smokes returned 200 for catalog `/api/v3/artists?include_autocreated=false`, catalog `/api/v2/shows/today?month=6&day=20`, user-library `/health`, Development session issue, and authenticated `/api/v3/library/users/me`; Metro on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D` bundled with `EXPO_PUBLIC_RELISTEN_CATALOG_API_BASE_URL=http://localhost:3823/api` and `EXPO_PUBLIC_RELISTEN_USER_API_BASE_URL=http://localhost:5119`, then served successful catalog requests from the app.
- Observation: `LibraryIndex` is the shared source-of-truth boundary for read-side favorites, not individual screen queries.
  Evidence: `LibraryIndex` now switches between scoped `UserFavorite` rows for authenticated scopes and legacy catalog flags for anonymous scopes, while Artists, My Library, show rows, source selection, source sorting, CarPlay, and tour filters consume its predicates.
- Observation: Source favorite rows can arrive before the catalog source relationship row needed to infer the parent show.
  Evidence: `LibraryIndex` listens to catalog show/source relationship changes while scoped favorites are active and has a regression test where a scoped source favorite starts without a `Source` row, then later marks the parent show/artist/year in-library when the catalog row loads.
- Observation: My Library download membership must stay narrower than offline availability.
  Evidence: `LibraryIndex` now tracks user-initiated download membership separately from general succeeded offline availability, and `library-index.test.ts` proves streaming cache rows are offline-available but not in My Library.
- Observation: The source detail screen had its own favorite controls outside `FavoriteObjectButton`.
  Evidence: Reviewer `019ee642-a01c-7aa1-850b-2714a3b8c393` found those controls still used catalog flags; `useCatalogFavoriteState` now backs both the reusable favorite button and the custom source detail actions.

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

2026-06-20: `MOB-AUTH-001` completed on branch `codex/scoped-realm-user-data`. The branch adds the user-library auth session service, SecureStore refresh-token store, Development-only sign-in gate, refresh/logout handling, bounded protected-request retry, and focused auth tests. Validation passed with `yarn test -- auth-session api-config`, `yarn test`, `yarn ts:check`, `yarn lint`, and `git diff --check`; live local API auth smoke is deferred until port `5119` is listening.

2026-06-20: `MOB-AUTH-002` completed on branch `codex/scoped-realm-user-data`. The branch adds the auth-session Realm bridge that validates server scope IDs, persists non-secret session metadata, switches active authenticated scopes, handles refresh bootstrap, and marks sessions signed out without deleting scoped rows. Validation passed with `yarn test -- auth-session scope`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, and subagent review.

2026-06-20: `MOB-SYNC-001` completed on branch `codex/scoped-realm-user-data`. The branch adds playlist pull-sync DTOs and a scoped Realm applier for playlist changes/tombstones, including guarded cursor persistence and schema version 16 additive playlist metadata fields. Validation passed with `yarn test -- playlist-sync`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, and subagent review.

2026-06-20: `MOB-FAV-001` completed on branch `codex/scoped-realm-user-data`. The branch aligns favorite entity types with the server `track` contract, adds authenticated favorite API helpers, applies scoped favorite changes/tombstones through pull sync, and copies existing catalog favorite flags into scoped rows once on first supported sync. Validation passed with `yarn test -- favorite-sync playlist-sync`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, and subagent review.

2026-06-20: `MOB-SYNC-002` completed on branch `codex/scoped-realm-user-data`. The branch adds a Realm-backed playlist operation outbox and replay service for idempotent server operations, including GUID validation, operation JSON stability, canonical playlist reconciliation, retryable auth/network/server failures, terminal deterministic errors, same-playlist failure skipping, and same-scope replay guarding. Validation passed with `yarn test -- playlist-operation-outbox playlist-sync`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, and subagent review.

2026-06-20: `MOB-SYNC-003` completed on branch `codex/scoped-realm-user-data`. The branch mounts authenticated user-library lifecycle sync, keeps auth and user-library API clients separate, replays pending playlist operations before pull sync, validates protected token server scope before scoped writes, refreshes on 401 through the auth session service, skips missing/signed-out/stale scopes, queues scope-change reruns, and includes focused stale-scope regression coverage. Validation passed with `yarn test -- user-library-sync-runner auth-session playlist-operation-outbox playlist-sync`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, and subagent review.

2026-06-20: `MOB-HIST-001` completed on branch `codex/scoped-realm-user-data`. The branch adds a scoped authenticated playback-history journal, deterministic `/history/batch` DTO/client helper, Queue V2 block attribution, additive Realm schema version 17 fields, and focused tests for scope isolation, idempotency, invalid attribution, disabled-history no-op behavior, and upload status transitions. Validation passed with `yarn test -- playback-history-batch queue-v2 scoped_user_library_models`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, and subagent review.

2026-06-20: `MOB-HIST-002` completed on branch `codex/scoped-realm-user-data`. The branch wires authenticated new-play history into the existing playback reporter without touching signed-out anonymous `/api/v2/live/play`, records Queue V2 playlist/block attribution into scoped rows, flushes `/history/batch` inside the protected sync runner with refresh-on-401 behavior, observes pending history rows from the bootstrap component, and drains multi-batch backlogs in one run. Validation passed with `yarn test -- playback-history-batch user-library-sync-runner playback-history-recording`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, and subagent review/re-review.

2026-06-20: `MOB-CAST-002` completed on branch `codex/scoped-realm-user-data`. The branch adds pure CarPlay Queue V2 row identity, wires the queue template to use Queue V2-backed row IDs while preserving runtime identifier fallback selection, and covers duplicate playlist entries plus cloned runtime rows in focused tests. Validation passed with `yarn test -- carplay-queue-v2 queue-v2`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, and subagent review/re-review.

2026-06-20: `MOB-AUTH-003` completed on branch `codex/scoped-realm-user-data`. The branch adds a `__DEV__`-only Settings account panel for local user-library development sign-in, backed by the real auth session service and Realm metadata bridge. It handles local sign-out even when remote revoke fails, cleans token state if Realm metadata application fails after sign-in, and avoids running dev-panel hooks in production. Validation passed with `yarn test -- development-auth auth-session`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, and subagent review/re-review; live auth smoke is deferred because `http://localhost:5119` is not listening.

2026-06-20: `MOB-API-001` and `MOB-TEST-001` continuation completed on branch `codex/scoped-realm-user-data`. The branch adds explicit catalog/user-library API config, a separate no-store user-library client, a non-UI local API probe helper, local dev docs, and API config tests. Validation passed with `yarn test -- api-config`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, and an iOS Simulator bundle launch with local API env vars set.

2026-06-20: `MOB-LINK-001` completed on branch `codex/scoped-realm-user-data`. The branch adds a pure deep-link sanitizer, removes raw query-param logging/navigation forwarding from `+not-found`, and owns placeholder playlist/auth callback routes before future token exchange work. Validation passed with `yarn test -- sanitizer`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, two-pass subagent review, and iOS Simulator deep-link smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`.

2026-06-20: `MOB-QUEUE-001` completed on branch `codex/scoped-realm-user-data`. The branch adds pure Queue V2 item identity, catalog migration helpers, duplicate playlist-entry keying, playback cursor/history attribution, and block shuffle grouping tests. Validation passed with `yarn test -- queue-v2`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, and two-pass subagent review. Simulator smoke was skipped because no runtime playback code changed.

2026-06-20: `MOB-QUEUE-002` completed on branch `codex/scoped-realm-user-data`. The branch adds additive Queue V2 fields to `PlayerState`, writes catalog Queue V2 state alongside legacy queue fields, and restores catalog queues by Queue V2 current key when available. Validation passed with `yarn test -- queue-v2 player_state`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, iOS Simulator playback/restore smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`, and follow-up subagent review.

2026-06-20: `MOB-QUEUE-003` completed on branch `codex/scoped-realm-user-data`. The branch carries Queue V2 item metadata on runtime queue tracks, assigns batched catalog items for source-screen and CarPlay queue construction, normalizes catalog item ids at persistence time, clones inserted queue rows to avoid runtime aliasing, and preserves stale legacy restore fallback behavior. Validation passed with `yarn test -- queue-v2 player_state`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, iOS Simulator source-page playback smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`, and three reviewer passes that drove duplicate-id and fallback fixes.

2026-06-20: `MOB-QUEUE-004` completed on branch `codex/scoped-realm-user-data`. The branch changes playlist entry positions to fractional strings with a schema version 15 migration, adds pure playlist Queue V2 construction from scoped playlist entries, and adds playable hydrated item filtering for future playlist playback callers. Validation passed with `yarn test -- queue-v2 scoped_user_library_models`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, iOS Simulator source-page playback smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`, and subagent review.

2026-06-20: `MOB-CAST-001` completed on branch `codex/scoped-realm-user-data`. The branch adds Queue V2 custom data to Cast queue items while preserving legacy media-info identifiers for status reconciliation. Validation passed with `yarn test -- cast-queue-v2 queue-v2`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, and subagent review. Live Cast hardware validation remains deferred.

2026-06-20: `MOB-FAV-002` completed on branch `codex/scoped-realm-user-data`. The branch adds signed-in scoped favorite state helpers, authenticated favorite mutation service with optimistic rollback, shared per-Realm runtime service construction, reusable heart-button scoped reads/writes for supported catalog objects, and missing-session/network/delete rollback tests. Validation passed with `yarn test -- favorite-sync`, `yarn test`, `yarn ts:check`, `yarn lint`, and `git diff --check`. The requested subagent review was attempted but failed due the Codex usage limit; a local root review found no further actionable issues.

2026-06-20: `MOB-REVIEW-001` completed on branch `codex/scoped-realm-user-data` after the usage limit reset. Four reviewer passes found cross-cutting issues and simplification opportunities; a post-fix reviewer pass found two remaining regressions, both fixed before commit. The branch now uses library UTF-8/base64 primitives for mobile grant storage keys, strips URL fragments before link logging, prevents user-library response bodies from becoming API error messages or persisted sync errors, makes catalog favorite import a one-time local-database migration rather than a per-user import, wakes sync on pending playlist operations and queues same-scope manual/history reruns while a sync is in flight, keeps 409 playlist operation conflicts retryable, reconciles Cast status by exact local runtime id then Queue V2 item id, wires Queue V2 block units into runtime shuffle without dropping duplicate runtime rows, centralizes active session metadata lookup, satisfies React Compiler memoization for scoped favorite buttons, and removes a stale dead queue restore helper. Validation passed with `yarn test -- user-library-sync-runner queue-v2 cast-queue-v2`, `yarn test -- favorite-sync api-config sanitizer share-token-exchange queue-v2 cast-queue-v2`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, and an iOS Simulator Metro bundle/render smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D` with local API env vars. Live local API response smoke remains deferred because the catalog endpoint returned 500 and the simple user-library probe paths returned 404 despite both ports listening.

2026-06-20: `MOB-API-002` completed on branch `codex/scoped-realm-user-data` after the local API servers were restarted healthy. The mobile local API probe now checks user-library `GET /health` directly instead of a library-prefixed username-check path, and the local development docs match that contract. Validation passed with `yarn test -- api-config`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, direct local catalog and user auth smokes, and an iOS Simulator Metro bundle/render smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D` with both local base URLs.

2026-06-20: `MOB-FAV-003` completed on branch `codex/scoped-realm-user-data`. `LibraryIndex` now provides effective direct favorite and library membership predicates backed by active scoped rows when signed in and legacy catalog flags when anonymous. Artists, My Library, show badges, source badges/default priority, source sorting, source detail controls, CarPlay library source resolution, CarPlay artist favorites, song filtering, and tour library filtering now consume that boundary. Validation passed with `yarn test -- library-index`, `yarn test -- library-index favorite-sync source_selection`, `yarn test`, `yarn ts:check`, `yarn lint`, `git diff --check`, reviewer pass/fix, and iOS Simulator bundle/render smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`. After API thread restart, live local API smoke also passed for user-library `/health`, catalog `/api/v3/artists`, Development session issue, bearer `/users/me`, favorite PUT/list/delete, history batch upload, pull sync, playlist operation payloads, share-token exchange/tokenless read/revoke, and logout.
