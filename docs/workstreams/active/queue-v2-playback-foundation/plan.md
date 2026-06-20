# Workstream: Queue V2 Playback Foundation

## Goal

Introduce Queue V2 as the mobile playback identity model without breaking existing catalog/source playback. Queue V2 must support catalog queue items and playlist queue items, block-aware shuffle, stable playlist entry cursors, duplicate source tracks in one playlist, persisted restore, and history attribution fields.

## Why This Workstream Exists

Playlist playback cannot be layered on the current source-track-only queue. The current queue wraps `SourceTrack`, generates ephemeral runtime identifiers, persists source-track UUID arrays, and restores by `sourceTrack.uuid`. That cannot distinguish duplicate tracks in a playlist or keep block shuffle and playlist history attribution correct.

## Mutable Surface

Allowed files and directories:

- `relisten/player/relisten_player_queue.tsx` and nearby queue/player files.
- `relisten/realm/models/player_state.ts` for persisted Queue V2 state and migration from existing source-track state.
- New pure queue model/helpers under `relisten/player/` for testable Queue V2 grouping, keying, and serialization.
- Existing source/show screen entry points only to preserve catalog queue construction.
- Tests for Queue V2 grouping, shuffle units, restore keying, and migration.
- `docs/autoplan-user-library-mobile.md`, `docs/loop-ledger-user-library-mobile.md`, and this workstream ledger.

Out of scope:

- Full playlist UI.
- Full Cast/CarPlay integration, which has its own backlog workstream.
- Auth, sync, Realm user-data models, or API client implementation.
- Native audio module changes unless pure TypeScript evidence proves they are required.

## Main Validator

Run from `/Users/alecgorge/code/relisten/relisten-mobile`:

    yarn test -- queue
    yarn lint
    yarn ts:check

Manual validation after integration should prove existing catalog playback still starts from source/show screens and existing persisted source-track queues restore as catalog Queue V2 items.

## Fastest Useful Current Check

Done for `MOB-QUEUE-001`:

    yarn test -- queue-v2

## Dependencies or Blockers

The pure Queue V2 model can start once the test harness exists. Full playlist playback depends on playlist endpoints, scoped Realm playlist entries, and catalog hydration for playlist source tracks.

## Current Hypothesis

The first slice should avoid broad playback rewrites. Add a pure Queue V2 item model and block-shuffle helpers, migrate persisted state format, and adapt catalog queues as `kind: "catalog"` items before adding playlist queue entry points.

## Next Scoped Step

Done for `MOB-QUEUE-001`. Next queue work should integrate the pure Queue V2 model with persisted `PlayerState` and existing catalog queue construction, then prove current catalog playback and legacy source-track restore still work.

## Code Quality Rules

Keep queue identity explicit. Do not use `sourceTrackUuid` as the identity for playlist items. Do not collapse standalone playlist entries with `blockUuid === null` into one shared shuffle unit. Existing catalog playback must remain a first-class path, not a compatibility afterthought.
