# Workstream: Scoped Realm User Data

## Goal

Add scoped Realm user-owned rows for playlists, playlist entries, favorites, settings, pending operations, sync cursors, playback journal rows, auth/session metadata, mobile access grants, and migration markers while keeping catalog rows as shared cache.

## Why This Workstream Exists

The design requires one Realm database with `scopeId` on every user-owned row. Signed-out local data, signed-in account data, and future external scopes must coexist without deleting catalog cache or rewriting catalog identity. Existing catalog `isFavorite` flags stay as rollout compatibility, not the long-term signed-in source of truth.

## Mutable Surface

Allowed files and directories:

- `relisten/realm/schema.ts` and new user-owned Realm model files.
- Scoped repository/service files under `relisten/realm/` or `relisten/user_library/`.
- Minimal active scope store/service.
- Tests for scope key generation, scope switching, and scoped query helpers.

Out of scope:

- Full sync implementation.
- Favorite migration and history migration, which have separate workstreams.
- Realm to TanStack DB migration.

## Main Validator

Run `yarn test -- scope`, `yarn lint`, and `yarn ts:check`.

## Fastest Useful Current Check

`yarn test -- scope`

## Dependencies or Blockers

This branch may add the minimal deterministic test harness needed for `yarn test -- scope`. Full auth/session implementation remains outside this workstream, but the scope ID shape must support anonymous and authenticated users without later changing primary keys.

## Current Hypothesis

Introduce a small active-scope service and additive Realm models with `scopeId` fields. Avoid destructive migration of old catalog favorites until the favorites workstream is active.

## Next Scoped Step

Done for `MOB-SCOPE-001`. Next scoped work belongs in dependent workstreams: auth/session should populate session metadata, playlist sync should fill playlist/outbox/cursor rows, favorites migration should copy compatibility favorite flags into scoped favorites, and history migration should write scoped playback journal rows.
