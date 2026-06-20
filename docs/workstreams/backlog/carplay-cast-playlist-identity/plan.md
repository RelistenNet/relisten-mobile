# Workstream: CarPlay And Cast Playlist Identity

## Goal

Carry Queue V2 playlist item identity through Cast and CarPlay so duplicate source tracks, block shuffle, playlist cursor, and history attribution work outside React screens.

## Why This Workstream Exists

The current Cast and CarPlay code uses runtime identifiers and source-track identity. Playlist playback must expose `playlistUuid`, `playlistEntryUuid`, `blockUuid`, `blockPosition`, and `sourceTrackUuid` to these paths before playlist playback is release-ready.

## Mutable Surface

Allowed files and directories:

- `relisten/casting/`.
- `relisten/carplay/`.
- Queue adapter files created by the Queue V2 workstream.
- Tests for queue item custom data where possible.
- Manual iOS Simulator/CarPlay/Cast validation notes where automation is not practical.

Out of scope:

- Queue V2 core model work, which belongs in the active Queue V2 workstream.
- Playlist UX.

## Main Validator

Run targeted queue/Cast/CarPlay tests if available, `yarn lint`, and `yarn ts:check`. Manual validation is expected for real CarPlay/Cast behavior.

## Fastest Useful Current Check

Pure tests for Cast custom data and CarPlay item identity adapters.

## Dependencies or Blockers

Depends on Queue V2 runtime integration.

## Current Hypothesis

Adapters can be updated to carry Queue V2 item metadata without native module changes. If native changes are required, record evidence and pivot.

## Next Scoped Step

Promote after Queue V2 catalog and playlist identity are wired through normal playback.
