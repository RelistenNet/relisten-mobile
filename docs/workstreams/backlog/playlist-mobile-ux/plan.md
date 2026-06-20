# Workstream: Playlist Mobile UX

## Goal

Design and implement the user-facing mobile playlist UX after auth, local API, Queue V2, scoped Realm, and basic sync foundations are working.

## Why This Workstream Exists

The design names required UX surfaces but does not yet resolve enough flow details to implement polished screens. The user explicitly expects this workstream to need more clarification and to be filled out after auth and basic foundations are real.

## Mutable Surface

Likely allowed files and directories after promotion:

- `app/relisten/tabs/(myLibrary)/`.
- Source/show track menus for Add to Playlist and Add Range as Block.
- Playlist route/screen files under `app/`.
- Playlist components under `relisten/components/` or a new focused playlist module.
- User-library repository/view-model code needed by screens.

Out of scope until clarified:

- Exact user-facing name for "block".
- Final signed-out share-token prompts.
- Invite/collaboration screen hierarchy.
- Conflict status presentation.
- Offline partial-block UI.

## Main Validator

To be defined after the UX clarification pass. At minimum, run `yarn lint`, `yarn ts:check`, relevant JS/TS tests, and iOS Simulator screen smoke checks.

## Fastest Useful Current Check

Not defined yet. This workstream should not be implemented until foundations exist and the UX rubric is written here.

## Dependencies or Blockers

Depends on auth/session, scoped Realm, playlist sync/outbox, Queue V2, share-token exchange, favorites/history choices, and a follow-up grill-me UX pass.

## Current Hypothesis

The right time to fill this out is after a user can sign in locally, fetch scoped user data, and play catalog Queue V2 without regression. At that point the UX questions can be asked against a working foundation instead of an abstract design.

## Next Scoped Step

Do not implement yet. When promoted, run a grill-me pass that resolves the UX rubric, screen map, labels, empty states, signed-out states, and conflict presentation.
