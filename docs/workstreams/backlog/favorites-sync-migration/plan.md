# Workstream: Favorites Sync Migration

## Goal

Preserve current signed-out favorites behavior while migrating authenticated favorites into scoped `user_favorites` rows for Artist, Show, Source, SourceTrack, Tour, and Song.

## Why This Workstream Exists

Current mobile favorite state is stored as booleans on catalog Realm objects and is used by library views, source prioritization, and CarPlay. M1 cannot silently drop source/tour/song favorites or collapse source favorites into show favorites. Signed-in user favorites need scoped rows and sync without regressing signed-out behavior.

## Mutable Surface

Allowed files and directories:

- Favorite button/components and repository helpers.
- Scoped favorite Realm models and migration marker models.
- User-library favorite client methods.
- Library/source selection code only where needed to read scoped favorite state for signed-in users.
- Tests for one-time migration and signed-out compatibility.

Out of scope:

- Removing old catalog `isFavorite` flags.
- Product deprecation of any favorite entity type.

## Main Validator

Run targeted favorite migration tests, `yarn lint`, and `yarn ts:check`.

## Fastest Useful Current Check

Pure migration tests over fixture objects once harness exists.

## Dependencies or Blockers

Depends on scoped Realm user data, auth/session, and favorites server endpoints.

## Current Hypothesis

Keep old flags during rollout. On first authenticated sync, copy current favorites into scoped rows and write a migration marker so they are not repeatedly enqueued.

## Next Scoped Step

Promote after scoped Realm user data and auth are working.
