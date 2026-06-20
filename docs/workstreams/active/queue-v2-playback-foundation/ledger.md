# Ledger: Queue V2 Playback Foundation

This ledger is the write-ahead log for `docs/workstreams/active/queue-v2-playback-foundation/plan.md`.

## Experiments

### MOB-QUEUE-001 - Pure Queue V2 identity foundation

- Status: completed
- Timestamp: 2026-06-20T01:09:59Z
- Intention / hypothesis: Pure Queue V2 types and block-shuffle helpers can be introduced and tested before changing runtime playback behavior.
- Responsible agent: root Codex agent
- Start commit: `2deeea7`
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: new queue model/helper files under `relisten/player/`, queue tests, minimal current queue imports if needed, and AutoPlan docs.
- Validator: `yarn test -- queue-v2`, `yarn test`, `yarn lint`, `yarn ts:check`, `git diff --check`, and iOS Simulator smoke if runtime queue code changes.
- Expected deliverable: tested Queue V2 item identity, catalog item migration shape, duplicate playlist entry keying, history attribution metadata, and block shuffle grouping semantics.
- Expected artifacts: code diff, validation transcript, and review notes.
- Linked ExecPlan: none unless runtime integration expands beyond this foundation.
- Evidence:
  - Added pure Queue V2 catalog and playlist item types with explicit `queueItemId`s and a persisted shape aligned to the design contract: `schemaVersion`, `items`, `currentItemKey`, and shuffled queue item ids.
  - Added catalog migration helpers that convert existing source-track UUID queues into catalog Queue V2 items with deterministic occurrence ids.
  - Added playlist item helpers that distinguish duplicate source tracks by `playlistEntryUuid` and expose playlist history attribution.
  - Added block shuffle unit helpers that group by non-null `blockUuid`, keep standalone entries as their own units, and sort block internals by `blockPosition`.
  - Added focused tests for catalog migration, duplicate legacy current-key ambiguity, duplicate playlist source-track identity, playback cursor/history attribution, and block shuffle grouping.
- Validators:
  - `yarn test -- queue-v2`: pass, 1 file / 4 tests.
  - `yarn test`: pass, 6 files / 24 tests.
  - `yarn ts:check`: pass.
  - `yarn lint`: pass.
  - `git diff --check`: pass.
  - iOS Simulator smoke: not run because this slice added pure helpers only and did not touch runtime playback code.
- Review:
  - First-pass review found two integration risks: competing active item ids and numeric playlist position in the Queue V2 shape.
  - Addressed both by switching to one `currentItemKey`, adding a duplicate legacy ambiguity test, and removing playlist `position` from Queue V2.
  - Second-pass review found no actionable issues.
- Outcome: pass
- next_action: continue

### MOB-QUEUE-002 - Queue V2 persisted catalog state

- Status: completed
- Timestamp: 2026-06-20T01:20:18Z
- Intention / hypothesis: Queue V2 state can be persisted alongside legacy source-track queue fields and used for catalog restore identity without changing catalog playback behavior.
- Responsible agent: root Codex agent
- Start commit: `737b541`
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: `relisten/realm/models/player_state.ts`, `relisten/realm/schema.ts`, `relisten/player/relisten_player_queue.tsx`, Queue V2 tests, and AutoPlan docs.
- Validator: `yarn test -- queue-v2`, `yarn test`, `yarn lint`, `yarn ts:check`, `git diff --check`, and iOS Simulator smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`.
- Expected deliverable: additive Queue V2 persisted fields for catalog queues, continued legacy fields for compatibility, and restore anchored by Queue V2 current item key when available.
- Expected artifacts: code diff, validation transcript, simulator smoke notes, and review notes.
- Linked ExecPlan: none.
- Evidence:
  - Added additive Queue V2 fields to `PlayerState` and bumped Realm schema version from 13 to 14.
  - Catalog queue saves now write Queue V2 schema version, item JSON, shuffled queue item ids, and current item key while keeping legacy source-track arrays and active indexes populated.
  - Restore now prefers Queue V2 item/current-key data when present and falls back to legacy source-track restore when Queue V2 state is absent or invalid.
  - Extracted and tested a pure restore plan for duplicate catalog occurrence restore by Queue V2 current key and legacy fallback.
  - Added `PlayerState` tests for Queue V2 field persistence and legacy-only writes.
  - iOS Simulator smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D` launched after schema bump, started Grateful Dead catalog playback, wrote Queue V2 fields to the simulator Realm, then relaunched and restored with `queueV2CurrentItemKey`.
- Validators:
  - `yarn test -- queue-v2 player_state`: pass, 2 files / 8 tests.
  - `yarn test`: pass, 7 files / 28 tests.
  - `yarn ts:check`: pass.
  - `yarn lint`: pass.
  - `git diff --check`: pass.
  - iOS Simulator smoke: pass; screenshot artifact `/tmp/relisten-queue-v2-playback-smoke.png`, restore log showed Queue V2 schema version `2` and restored runtime identifier from `queueV2CurrentItemKey`.
- Review:
  - First-pass review found no runtime correctness bug but requested automated restore coverage.
  - Added the pure restore plan and tests for duplicate Queue V2 restore plus legacy fallback.
  - Follow-up review found no actionable issues.
- Outcome: pass
- next_action: continue

### MOB-QUEUE-003 - Runtime queue item metadata

- Status: completed
- Timestamp: 2026-06-20T01:36:45Z
- Intention / hypothesis: `PlayerQueueTrack` can carry Queue V2 item metadata through existing catalog queue APIs, preparing playlist queue construction without changing playback behavior.
- Responsible agent: root Codex agent
- Start commit: `c3b5c2e`
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: `relisten/player/relisten_player_queue.tsx`, source-screen and CarPlay catalog queue construction call sites, Queue V2 tests if needed, and AutoPlan docs.
- Validator: `yarn test -- queue-v2 player_state`, `yarn test`, `yarn lint`, `yarn ts:check`, `git diff --check`, and iOS Simulator catalog playback smoke on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`.
- Expected deliverable: runtime queue tracks expose stable Queue V2 item metadata; catalog queue construction assigns catalog Queue V2 items before playback; restore recreates queue tracks with persisted Queue V2 items.
- Expected artifacts: code diff, validation transcript, simulator smoke notes, and review notes.
- Linked ExecPlan: none.
- End timestamp: 2026-06-20T01:54:34Z
- Evidence:
  - `PlayerQueueTrack` now carries a Queue V2 item, catalog queue construction can assign deterministic occurrence-aware catalog items, and restore rebuilds runtime tracks with persisted Queue V2 items.
  - Source-screen playback and CarPlay catalog queue helpers now use the batched catalog queue constructor so duplicate source-track UUIDs receive distinct catalog queue item ids.
  - Queue V2 persistence normalizes catalog item ids by ordered queue position, keeps playlist item ids intact, maps shuffled/current ids from runtime order, and clones queue inserts so re-queuing an existing runtime row does not alias identifiers.
  - Legacy source-track restore now migrates through Queue V2 catalog items while preserving the previous cross-index fallback for stale rows with incomplete active indexes.
- Validators:
  - `yarn test -- queue-v2 player_state`: pass, 2 files / 11 tests.
  - `yarn test`: pass, 7 files / 31 tests.
  - `yarn ts:check`: pass.
  - `yarn lint`: pass.
  - `git diff --check`: pass.
  - iOS Simulator smoke: pass on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`; source-page Play started catalog playback from the current Metro bundle. Screenshot artifact: `/tmp/relisten-queue-v2-runtime-metadata-final-smoke.png`.
- Review:
  - First-pass review found duplicate Queue V2 ids for legacy restore and single-track incremental inserts.
  - Second-pass review found runtime track aliasing when re-queuing an existing queue row.
  - Final review found a stale legacy-row fallback regression.
  - Addressed all findings with migrated legacy Queue V2 items, save-time normalization, cloned queue inserts, and cross-index legacy fallback coverage.
- Outcome: pass
- next_action: continue
- Next move: Commit `MOB-QUEUE-003`, then continue Queue V2 with playlist queue construction or promote auth/session if the local dev-auth endpoint is ready.

### MOB-QUEUE-004 - Playlist queue construction foundation

- Status: completed
- Timestamp: 2026-06-20T01:57:39Z
- Intention / hypothesis: Playlist queue construction can be added as a tested mobile foundation without adding playlist UI by mapping scoped playlist entries into Queue V2 playlist items and hydrated runtime queue tracks.
- Responsible agent: root Codex agent
- Start commit: `e7d448c`
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: `relisten/player/queue_v2.ts`, `relisten/player/relisten_player_queue.tsx`, `relisten/realm/models/user_library/playlists.ts`, `relisten/realm/schema.ts`, focused Queue V2/user-library model tests, and AutoPlan docs.
- Validator: `yarn test -- queue-v2 scoped_user_library_models`, `yarn test`, `yarn lint`, `yarn ts:check`, `git diff --check`, and iOS Simulator catalog playback smoke if runtime queue code changes.
- Expected deliverable: fractional string playlist entry positions in Realm, pure Queue V2 playlist item construction ordered by playlist position, duplicate playlist entries keyed by `playlistEntryUuid`, deleted entries excluded, unavailable entries represented at the Queue V2 item layer but skipped when building hydrated runtime playback tracks.
- Expected artifacts: code diff, validation transcript, review notes, and simulator smoke notes if the runtime queue constructor changes.
- Linked ExecPlan: none.
- End timestamp: 2026-06-20T02:07:18Z
- Evidence:
  - Changed `UserPlaylistEntry.position` to a string to match the fractional-indexing API contract and bumped Realm schema version from 14 to 15.
  - Added a user-library Realm migration that converts legacy numeric playlist entry positions to strings and safely no-ops for older catalog-only Realms where `UserPlaylistEntry` did not exist.
  - Added pure playlist Queue V2 construction helpers that order active entries by playlist position, exclude deleted entries, preserve unavailable entries at the item layer, and key duplicate source tracks by `playlistEntryUuid`.
  - Added playable playlist item construction for hydrated runtime playback, skipping unavailable entries and source tracks missing from Realm while preserving entry-specific Queue V2 ids for available duplicates.
  - Added `PlayerQueueTrack.fromPlaylistEntries` as the future playlist UI/sync entry point for hydrated playback construction.
- Validators:
  - `yarn test -- queue-v2 scoped_user_library_models`: pass, 2 files / 19 tests.
  - `yarn test`: pass, 7 files / 37 tests.
  - `yarn ts:check`: pass.
  - `yarn lint`: pass.
  - `git diff --check`: pass.
  - iOS Simulator smoke: pass on `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`; schema version 15 bundle loaded and source-page catalog playback still started. Screenshot artifact: `/tmp/relisten-queue-v2-playlist-construction-smoke.png`.
- Review:
  - First-pass review found a migration crash for upgrades from schemas before `UserPlaylistEntry` existed and requested runtime playable-construction coverage.
  - Addressed with an old-schema guard, schema-12 migration test, pure playable item helper, and missing/unavailable source-track coverage.
  - Follow-up review found no remaining functional blocker; it noted the new migration file must be included in the commit and that direct `PlayerQueueTrack.fromPlaylistEntries` coverage remains a residual test gap because the wrapper imports native playback modules.
- Outcome: pass
- next_action: continue
- Next move: Commit `MOB-QUEUE-004`, then promote CarPlay/Cast playlist identity or auth/session depending on server dev-auth readiness.

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
