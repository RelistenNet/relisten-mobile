# Ledger: CarPlay And Cast Playlist Identity

This ledger is the write-ahead log for `docs/workstreams/backlog/carplay-cast-playlist-identity/plan.md`.

## Experiments

### MOB-CAST-001 - Cast Queue V2 custom data

- Status: completed
- Timestamp: 2026-06-20T02:08:41Z
- Intention / hypothesis: Cast queue payloads can carry Queue V2 item identity through `customData` without native module changes, preserving playlist entry attribution for duplicate source tracks.
- Responsible agent: root Codex agent
- Start commit: `9185d04`
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: `relisten/casting/cast_driver.ts`, Queue V2 adapter helpers/tests under `relisten/player/` or `relisten/casting/`, AutoPlan docs, and this ledger.
- Validator: targeted Cast/Queue V2 tests, `yarn test`, `yarn lint`, `yarn ts:check`, `git diff --check`; manual Cast hardware validation is deferred unless a device/session is available.
- Expected deliverable: tested pure custom-data adapter that emits catalog and playlist Queue V2 identifiers for Cast queue items while preserving existing stream metadata.
- Expected artifacts: code diff, validation transcript, and review notes.
- Linked ExecPlan: none.
- End timestamp: 2026-06-20T04:10:27Z
- Evidence:
  - Added a native-free Cast Queue V2 custom-data adapter with separate payloads for top-level `MediaQueueItem.customData` and legacy `mediaInfo.customData`.
  - Cast queue item construction now writes Queue V2 kind, item id, source track uuid, and playlist entry/block metadata to top-level queue item custom data.
  - Existing Cast media-info custom data keeps the runtime `identifier` and `sourceTrackUuid` for status reconciliation.
  - Added focused tests for catalog custom data, duplicate playlist entries sharing one source track, and the queue-item versus media-info custom-data split.
- Validators:
  - `yarn test -- cast-queue-v2 queue-v2`: pass, 2 files / 15 tests.
  - `yarn test`: pass, 8 files / 40 tests.
  - `yarn ts:check`: pass.
  - `yarn lint`: pass.
  - `git diff --check`: pass.
  - Live Cast receiver/status round-trip: not run; no Cast hardware/session was available in this environment.
- Review:
  - First-pass review found Queue V2 data was only being placed in `mediaInfo.customData`, not top-level queue-item `customData`.
  - Addressed by splitting queue-item and media-info payload helpers and wiring top-level `customData` in `cast_driver.ts`.
  - Follow-up review found no concrete code bugs and noted live Cast hardware validation remains deferred.
- Outcome: pass
- next_action: continue
- Next move: Continue this workstream with CarPlay playlist identity display/selection or promote auth/session if server dev-auth readiness is confirmed.

### MOB-CAST-002 - CarPlay Queue V2 row identity

- Status: completed
- Timestamp: 2026-06-20T06:00:38Z
- Intention / hypothesis: CarPlay queue rows can use deterministic Queue V2-backed item identifiers while preserving runtime-identifier fallback selection, so duplicate source tracks and playlist entries remain distinguishable outside React screens without native module changes.
- Responsible agent: root Codex agent
- Start commit: `461b59d`
- End commit: this commit (`feat(carplay): add Queue V2 row identity`)
- Worktree or branch: `codex/scoped-realm-user-data`
- Mutable surface: `relisten/carplay/queue.ts`, new pure CarPlay queue identity helper/tests under `relisten/carplay/`, AutoPlan docs, and this ledger.
- Validator: `yarn test -- carplay-queue-v2 queue-v2`, `yarn test`, `yarn lint`, `yarn ts:check`, and `git diff --check`; live CarPlay UI validation remains simulator/hardware dependent.
- Expected deliverable: tested helper that emits CarPlay row IDs and metadata from `PlayerQueueTrack.queueV2Item`, queue template row IDs wired through the helper, and selection fallback for pre-existing runtime identifier IDs.
- Expected artifacts: code diff, focused tests, validation transcript, and review notes.
- Linked ExecPlan: none.
- Evidence: Added a pure CarPlay Queue V2 identity helper that builds row IDs from encoded Queue V2 item IDs plus runtime queue identifiers, exposes playlist/source/block metadata for future adapters, and resolves selection by Queue V2 row ID before falling back to legacy runtime identifiers.
- Queue evidence: `createQueueListTemplate` now emits Queue V2-backed row IDs while keeping current-track state tied to runtime identifiers, so duplicate playlist entries and cloned runtime rows remain selectable independently.
- Validators: `yarn test -- carplay-queue-v2 queue-v2` passed with 3 files / 17 tests; `yarn test` passed with 17 files / 120 tests; `yarn lint`; `yarn ts:check`; `git diff --check`.
- Review: Reviewer found a low test gap for selecting cloned rows by the new CarPlay row ID. Added the assertion and re-review reported no findings.
- Outcome: pass
- next_action: continue
- Next move: Treat native-free Cast and CarPlay Queue V2 identity as complete until playlist playback UI creates deeper CarPlay playlist browsing requirements; live CarPlay UI validation remains deferred.
