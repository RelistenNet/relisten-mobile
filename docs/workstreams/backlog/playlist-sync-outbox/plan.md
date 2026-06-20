# Workstream: Playlist Sync Outbox

## Goal

Implement Realm-backed user-data pull sync and pending operation replay for playlists and playlist entries. Local playlist mutations should apply optimistic state, persist an idempotent pending operation, replay against `/api/v3/library`, and reconcile with canonical server state.

## Why This Workstream Exists

M1 collaborative playlists are not real-time WebSocket sync. The mobile client needs a durable outbox and pull-sync path that works on launch, foreground, reconnect, and after local writes. This must be React-independent so screens, CarPlay/Cast paths, and app lifecycle hooks can trigger sync.

## Mutable Surface

Allowed files and directories:

- Scoped Realm models and repositories for playlists, entries, sync cursors, tombstones, and pending operations.
- User-library client sync and operation methods.
- React-independent sync runner/service.
- Tests for operation serialization, idempotency keys, dependency skipping, cursor application, and tombstones.

Out of scope:

- Playlist UX polish.
- Server operation implementation.

## Main Validator

Run targeted sync/outbox tests, `yarn lint`, and `yarn ts:check`.

## Fastest Useful Current Check

Pure reducer/service tests for applying sync changes and tombstones.

## Dependencies or Blockers

Depends on scoped Realm user data, user-library client, playlist server endpoints, and basic auth/session.

## Current Hypothesis

Implement sync as plain TypeScript services with Realm repositories at the boundary. Pull sync and operation replay now share canonical playlist snapshot application; operation payloads stay explicit and GUID-first.

## Next Scoped Step

Wire pull sync and operation replay into authenticated app lifecycle triggers such as launch, foreground, reconnect, and post-local-write flush. Keep that runner React-independent and gate it on an active authenticated scope.
