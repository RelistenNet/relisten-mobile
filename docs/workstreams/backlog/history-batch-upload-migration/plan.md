# Workstream: History Batch Upload Migration

## Goal

Move new authenticated playback history to a scoped local journal with `clientEventUuid`, `deviceId`, optional playlist attribution, and batch upload to `/api/v3/library/history/batch`, while keeping existing local history visible and signed-out behavior compatible.

## Why This Workstream Exists

Current mobile history is local, source-track based, and uploads anonymous aggregate plays one at a time through `/api/v2/live/play`. User accounts require per-user history that is idempotent, scoped, history-preference aware, and able to attribute playlist plays to `playlistUuid` and `playlistEntryUuid`.

## Mutable Surface

Allowed files and directories:

- `relisten/playback_history_reporter.ts`.
- `relisten/realm/models/history/` and history repositories.
- User-library history client methods.
- Queue V2 integration points for playlist attribution.
- Tests for journal write, batch payloads, sync status, history-disabled behavior, and signed-out compatibility.

Out of scope:

- Deleting or bulk-uploading old local history by default.
- Server history implementation.

## Main Validator

Run targeted history tests, `yarn lint`, and `yarn ts:check`.

## Fastest Useful Current Check

Pure tests for batch payload construction and history-disabled behavior.

## Dependencies or Blockers

Depends on auth/session, scoped Realm user data, Queue V2 attribution, and history server endpoint.

## Current Hypothesis

New rows use the scoped journal. Existing local history remains visible and old rows are not uploaded as personal history unless a later product decision says so.

## Next Scoped Step

Promote after auth, scoped Realm, and Queue V2 attribution basics exist.
